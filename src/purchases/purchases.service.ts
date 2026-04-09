import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { ConfigService } from "@nestjs/config";
import { Purchase, PurchaseDocument } from "./schemas/purchase.schema";
import { InternalPurchaseStatus, PurchaseInterface } from "./types/types";
import { Project, ProjectDocument } from "src/projects/schemas/project.schema";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  type VersionedTransactionResponse,
} from "@solana/web3.js";
import { createHash } from "crypto";
import {
  create,
  fetchAssetV1,
  mplCore,
  ruleSet,
} from "@metaplex-foundation/mpl-core";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  createNoopSigner,
  generateSigner,
  publicKey,
  signerIdentity,
} from "@metaplex-foundation/umi";
import {
  toWeb3JsInstruction,
  toWeb3JsPublicKey,
} from "@metaplex-foundation/umi-web3js-adapters";
import {
  MarketplaceListing,
  MarketplaceListingDocument,
} from "./schemas/marketplace-listing.schema";
import { MarketplaceListingStatus } from "./types/types";

@Injectable()
export class PurchasesService {
  private readonly logger = new Logger(PurchasesService.name);
  private readonly solanaRpcUrl: string;
  private readonly creatorRoyaltyBps: number;
  private readonly marketplaceFeeBps: number;
  private readonly marketplaceProgramId: string;

  constructor(
    @InjectModel(Purchase.name)
    private purchaseModel: Model<PurchaseDocument>,
    @InjectModel(Project.name)
    private projectModel: Model<ProjectDocument>,
    @InjectModel(MarketplaceListing.name)
    private marketplaceListingModel: Model<MarketplaceListingDocument>,
    private configService: ConfigService,
  ) {
    this.solanaRpcUrl =
      this.configService.get<string>("SOLANA_RPC_URL") ||
      "https://api.devnet.solana.com";
    this.creatorRoyaltyBps = Number(
      this.configService.get<string>("PROJECT_CREATOR_ROYALTY_BPS") || 500,
    );
    this.marketplaceFeeBps = Number(
      this.configService.get<string>("MARKETPLACE_PLATFORM_FEE_BPS") || 250,
    );
    this.marketplaceProgramId =
      this.configService.get<string>("MARKETPLACE_PROGRAM_ID") ||
      "9Wx3m7A3Au4gW4Q6KzksVhV2pGvED2w8R7Pw6w5zrWfU";
  }

  async preparePurchase(input: {
    userId: string;
    projectId: string;
    buyerWalletAddress: string;
  }): Promise<{
    serializedTransaction: string;
    expectedMint: string;
    metadataUri: string;
    projectId: string;
    amountLamports: number;
  }> {
    const { userId, projectId, buyerWalletAddress } = input;

    if (!Types.ObjectId.isValid(projectId))
      throw new BadRequestException("Invalid projectId");

    const existing = await this.purchaseModel.findOne({
      userId: new Types.ObjectId(userId),
      projectId: new Types.ObjectId(projectId),
      internalStatus: {
        $in: [InternalPurchaseStatus.PENDING, InternalPurchaseStatus.PAID],
      },
    });
    if (existing?.internalStatus === InternalPurchaseStatus.PAID)
      throw new BadRequestException("Project already purchased");

    const project = await this.projectModel.findById(projectId).lean().exec();
    if (!project) throw new BadRequestException("Project not found");

    const buyerPublicKey = new PublicKey(buyerWalletAddress);
    const creatorPublicKey = new PublicKey(project.creatorWallet);
    const connection = new Connection(this.solanaRpcUrl, "confirmed");
    const latestBlockhash = await connection.getLatestBlockhash("confirmed");

    const umi = createUmi(this.solanaRpcUrl).use(mplCore());
    const buyerUmiPk = publicKey(buyerWalletAddress);
    umi.use(signerIdentity(createNoopSigner(buyerUmiPk), true));

    const assetSigner = generateSigner(umi);
    const metadataUri = this.buildMetadataUri(projectId, userId);
    const creatorUmiPk = publicKey(project.creatorWallet);

    const coreBuilder = create(umi, {
      asset: assetSigner,
      name: `Cognios Access Pass - ${project.title}`,
      uri: metadataUri,
      owner: buyerUmiPk,
      plugins: [
        {
          type: "Royalties",
          basisPoints: this.creatorRoyaltyBps,
          creators: [{ address: creatorUmiPk, percentage: 15 }],
          ruleSet: ruleSet("None"),
        },
      ],
    });

    const tx = new Transaction({
      feePayer: buyerPublicKey,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    });

    tx.add(
      SystemProgram.transfer({
        fromPubkey: buyerPublicKey,
        toPubkey: creatorPublicKey,
        lamports: project.price,
      }),
    );

    for (const umiInstruction of coreBuilder.getInstructions()) {
      tx.add(toWeb3JsInstruction(umiInstruction));
    }

    for (const signer of coreBuilder.getSigners(umi)) {
      if (!("secretKey" in signer)) continue;
      const keypair = Keypair.fromSecretKey(
        Uint8Array.from(signer.secretKey as Uint8Array),
      );
      tx.partialSign(keypair);
    }

    await this.purchaseModel.findOneAndUpdate(
      {
        userId: new Types.ObjectId(userId),
        projectId: new Types.ObjectId(projectId),
      },
      {
        $set: {
          userId: new Types.ObjectId(userId),
          projectId: new Types.ObjectId(projectId),
          creatorId: project.creatorId,
          creatorWalletAddress: project.creatorWallet,
          buyerWalletAddress,
          price: project.price,
          metadataUri,
          nftMint: toWeb3JsPublicKey(assetSigner.publicKey).toBase58(),
          internalStatus: InternalPurchaseStatus.PENDING,
          purchasedAt: new Date(),
        },
      },
      { upsert: true, new: true },
    );

    return {
      serializedTransaction: tx
        .serialize({ verifySignatures: false, requireAllSignatures: false })
        .toString("base64"),
      expectedMint: toWeb3JsPublicKey(assetSigner.publicKey).toBase58(),
      metadataUri,
      projectId,
      amountLamports: project.price,
    };
  }

  async confirmPurchase(input: {
    userId: string;
    projectId: string;
    buyerWalletAddress: string;
    txSignature: string;
    expectedMint: string;
  }): Promise<{
    purchaseId: string;
    status: InternalPurchaseStatus;
    txSignature: string;
    nftMint?: string;
  }> {
    const { userId, projectId, buyerWalletAddress, txSignature, expectedMint } =
      input;

    const existingBySignature = await this.purchaseModel
      .findOne({ txSignature })
      .lean()
      .exec();
    if (existingBySignature) {
      return {
        purchaseId: existingBySignature._id?.toString() || "",
        status: existingBySignature.internalStatus,
        txSignature,
        nftMint: existingBySignature.nftMint,
      };
    }

    const connection = new Connection(this.solanaRpcUrl, "confirmed");
    const [tx, project] = await Promise.all([
      connection.getTransaction(txSignature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      }),
      this.projectModel.findById(projectId).lean().exec(),
    ]);

    if (!project) throw new BadRequestException("Project not found");
    if (!tx) throw new BadRequestException("Transaction not found");
    if (tx.meta?.err) throw new BadRequestException("Transaction failed");

    const messageKeys =
      tx.transaction.message.getAccountKeys().staticAccountKeys;
    const hasBuyer = messageKeys.some(
      (key) => key.toBase58() === buyerWalletAddress,
    );
    const hasCreator = messageKeys.some(
      (key) => key.toBase58() === project.creatorWallet,
    );
    const hasMint = messageKeys.some((key) => key.toBase58() === expectedMint);

    if (!hasBuyer || !hasCreator)
      throw new BadRequestException(
        "Transaction does not match purchase parties",
      );
    if (!hasMint)
      throw new BadRequestException(
        "Transaction does not include expected mint",
      );

    let ownerAddress: string | null = null;
    let mintError: string | undefined;
    try {
      const mintedAsset = await this.fetchAssetWithRetry(expectedMint);
      ownerAddress = toWeb3JsPublicKey(mintedAsset.owner).toBase58();
    } catch (error) {
      mintError = (error as Error).message || "Failed to fetch minted asset";
      this.logger.warn(
        `Mint verification failed for ${expectedMint}: ${mintError}`,
      );
    }

    const internalStatus =
      ownerAddress === buyerWalletAddress
        ? InternalPurchaseStatus.PAID
        : InternalPurchaseStatus.MINT_FAILED;

    const purchase = await this.purchaseModel.findOneAndUpdate(
      {
        userId: new Types.ObjectId(userId),
        projectId: new Types.ObjectId(projectId),
      },
      {
        $set: {
          userId: new Types.ObjectId(userId),
          projectId: new Types.ObjectId(projectId),
          creatorId: project.creatorId,
          creatorWalletAddress: project.creatorWallet,
          buyerWalletAddress,
          nftMint: expectedMint,
          txSignature,
          mintTxSignature: txSignature,
          mintedAt: new Date(),
          internalStatus,
          mintError:
            internalStatus === InternalPurchaseStatus.MINT_FAILED
              ? mintError || "Mint owner mismatch"
              : undefined,
          purchasedAt: new Date(),
          price: project.price,
        },
      },
      { upsert: true, new: true },
    );

    if (internalStatus === InternalPurchaseStatus.PAID)
      await this.projectModel.updateOne(
        { _id: new Types.ObjectId(projectId) },
        { $inc: { purchaseCount: 1 } },
      );

    return {
      purchaseId: purchase?._id?.toString() || "",
      status: internalStatus,
      txSignature,
      nftMint: expectedMint,
    };
  }

  async prepareMarketplaceList(input: {
    userId: string;
    projectId: string;
    sellerWalletAddress: string;
    priceLamports: number;
    expiryTs?: number;
  }): Promise<{ serializedTransaction: string; listingId: string }> {
    const { userId, projectId, sellerWalletAddress, priceLamports } = input;
    if (!Types.ObjectId.isValid(projectId))
      throw new BadRequestException("Invalid projectId");
    if (priceLamports <= 0)
      throw new BadRequestException("priceLamports must be greater than 0");
    const eligibility = await this.getMarketplaceListingEligibility({
      projectId,
      sellerWalletAddress,
    });
    if (!eligibility.canList || !eligibility.mint)
      throw new BadRequestException(
        eligibility.reason ||
          "Connected wallet does not hold an NFT for this project",
      );
    const mint = eligibility.mint;

    const projectPubkey = this.projectIdToPubkey(projectId);
    const listingId = this.buildListingId({
      mint,
      projectId,
      sellerWalletAddress,
    });
    const listingPda = this.deriveListingPda({
      seller: new PublicKey(sellerWalletAddress),
      mint: new PublicKey(mint),
      projectPubkey,
    }).toBase58();

    const onChainStatus = await this.fetchOnChainListingStatus(listingPda);
    if (onChainStatus === MarketplaceListingStatus.ACTIVE) {
      await this.marketplaceListingModel.findOneAndUpdate(
        { listingId },
        {
          $set: {
            listingId,
            listingPda,
            mint,
            projectId: new Types.ObjectId(projectId),
            projectPubkey: projectPubkey.toBase58(),
            sellerId: new Types.ObjectId(userId),
            sellerWalletAddress,
            priceLamports,
            expiryTs: input.expiryTs || 0,
            status: MarketplaceListingStatus.ACTIVE,
          },
        },
        { upsert: true, new: true },
      );
      throw new BadRequestException("NFT is already listed on-chain");
    }

    const ownsMint = await this.verifyNftOwnership(mint, sellerWalletAddress);
    if (!ownsMint) {
      const [currentOwner, listingStatus] = await Promise.all([
        this.getNftOwnerAddress(mint),
        this.fetchOnChainListingStatus(listingPda),
      ]);
      throw new BadRequestException(
        `Connected wallet does not own this NFT. currentOwner=${currentOwner || "unknown"} listingStatus=${listingStatus || "unknown"} listingPda=${listingPda}`,
      );
    }

    await this.marketplaceListingModel.findOneAndUpdate(
      { listingId },
      {
        $set: {
          listingId,
          listingPda,
          mint,
          projectId: new Types.ObjectId(projectId),
          projectPubkey: projectPubkey.toBase58(),
          sellerId: new Types.ObjectId(userId),
          sellerWalletAddress,
          priceLamports,
          expiryTs: input.expiryTs || 0,
          status: onChainStatus || MarketplaceListingStatus.DELISTED,
        },
      },
      { upsert: true, new: true },
    );

    const tx = await this.buildAnchorListTx({
      sellerWalletAddress,
      mint,
      projectPubkey,
      priceLamports,
      expiryTs: input.expiryTs || 0,
    });

    return { serializedTransaction: tx, listingId };
  }

  async getMarketplaceListingEligibility(input: {
    projectId: string;
    sellerWalletAddress: string;
  }): Promise<{ canList: boolean; mint: string | null; reason?: string }> {
    if (!Types.ObjectId.isValid(input.projectId))
      throw new BadRequestException("Invalid projectId");

    const projectIdObj = new Types.ObjectId(input.projectId);
    const projectMints = await this.purchaseModel
      .find({
        projectId: projectIdObj,
        internalStatus: InternalPurchaseStatus.PAID,
        nftMint: { $exists: true, $ne: null },
      })
      .select({ nftMint: 1 })
      .lean()
      .exec();

    const uniqueMints = Array.from(
      new Set(
        projectMints
          .map((purchase) => purchase.nftMint?.trim())
          .filter((mint): mint is string => !!mint),
      ),
    );

    for (const mint of uniqueMints) {
      const ownsMint = await this.verifyNftOwnership(
        mint,
        input.sellerWalletAddress,
      );
      if (ownsMint) return { canList: true, mint };
    }

    return {
      canList: false,
      mint: null,
      reason:
        "Connected wallet does not hold a project NFT. Transfer it to this wallet before listing.",
    };
  }

  async confirmMarketplaceList(input: {
    userId: string;
    listingId: string;
    sellerWalletAddress: string;
    txSignature: string;
  }) {
    const tx = await this.fetchSuccessfulTransaction(input.txSignature);
    const hasSigner = tx.transaction.message
      .getAccountKeys()
      .staticAccountKeys.some(
        (key) => key.toBase58() === input.sellerWalletAddress,
      );
    if (!hasSigner) throw new BadRequestException("Invalid listing signer");
    const listingBefore = await this.marketplaceListingModel
      .findOne({
        listingId: input.listingId,
        sellerId: new Types.ObjectId(input.userId),
      })
      .lean()
      .exec();
    if (!listingBefore) throw new BadRequestException("Listing not found");
    const messageKeys = tx.transaction.message
      .getAccountKeys()
      .staticAccountKeys.map((key) => key.toBase58());
    if (!messageKeys.includes(this.marketplaceProgramId))
      throw new BadRequestException(
        "Transaction does not invoke marketplace program",
      );
    if (!messageKeys.includes(listingBefore.listingPda))
      throw new BadRequestException(
        "Transaction does not include expected listing PDA",
      );
    if (!this.transactionHasMarketplaceInstruction(tx, "list_nft")) {
      throw new BadRequestException(
        "Transaction does not include list_nft instruction",
      );
    }
    let escrowedToListing = false;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      escrowedToListing = await this.verifyNftOwnership(
        listingBefore.mint,
        listingBefore.listingPda,
      );
      if (escrowedToListing) break;
      await this.sleep(500 * (attempt + 1));
    }
    if (!escrowedToListing) {
      const [onChainStatus, currentOwner] = await Promise.all([
        this.fetchOnChainListingStatus(listingBefore.listingPda),
        this.getNftOwnerAddress(listingBefore.mint),
      ]);
      if (onChainStatus !== MarketplaceListingStatus.ACTIVE) {
        throw new BadRequestException(
          `Listing transaction confirmed, but NFT is not escrowed to listing PDA. currentOwner=${currentOwner || "unknown"} expectedOwner=${listingBefore.listingPda} listingStatus=${onChainStatus || "unknown"}`,
        );
      }

      this.logger.warn(
        `Listing ${listingBefore.listingId} became active on-chain before ownership index reflected escrow. currentOwner=${currentOwner || "unknown"} expectedOwner=${listingBefore.listingPda}`,
      );
    }

    const listing = await this.marketplaceListingModel.findOneAndUpdate(
      {
        listingId: input.listingId,
        sellerId: new Types.ObjectId(input.userId),
      },
      {
        $set: {
          status: MarketplaceListingStatus.ACTIVE,
          listTxSignature: input.txSignature,
          listedAt: new Date(),
        },
      },
      { new: true },
    );
    if (!listing) throw new BadRequestException("Listing not found");
    return { listingId: listing.listingId, status: listing.status };
  }

  async prepareMarketplaceDelist(input: {
    userId: string;
    listingId: string;
    sellerWalletAddress: string;
  }): Promise<{ serializedTransaction: string; listingId: string }> {
    const listing = await this.marketplaceListingModel.findOne({
      listingId: input.listingId,
      sellerId: new Types.ObjectId(input.userId),
      sellerWalletAddress: input.sellerWalletAddress,
    });
    if (!listing) throw new BadRequestException("Listing not found");
    const listingPda =
      listing.listingPda ||
      this.deriveListingPda({
        seller: new PublicKey(listing.sellerWalletAddress),
        mint: new PublicKey(listing.mint),
        projectPubkey: listing.projectPubkey
          ? new PublicKey(listing.projectPubkey)
          : this.projectIdToPubkey(listing.projectId.toString()),
      }).toBase58();

    let onChainStatus: MarketplaceListingStatus | null = null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      onChainStatus = await this.fetchOnChainListingStatus(listingPda);
      if (onChainStatus) break;
      await this.sleep(350 * (attempt + 1));
    }

    if (onChainStatus && onChainStatus !== listing.status) {
      await this.marketplaceListingModel.updateOne(
        { _id: listing._id },
        { $set: { status: onChainStatus } },
      );
    }

    if (onChainStatus !== MarketplaceListingStatus.ACTIVE) {
      if (onChainStatus === MarketplaceListingStatus.SOLD)
        throw new BadRequestException("Listing has already been sold");
      if (onChainStatus === MarketplaceListingStatus.DELISTED)
        throw new BadRequestException("Listing has been delisted");
      throw new BadRequestException(
        `Listing is not active on-chain. listingStatus=${onChainStatus || "unknown"} listingId=${listing.listingId}`,
      );
    }

    const tx = await this.buildAnchorDelistTx({
      sellerWalletAddress: input.sellerWalletAddress,
      mint: listing.mint,
      listingPda,
    });
    return { serializedTransaction: tx, listingId: input.listingId };
  }

  async confirmMarketplaceDelist(input: {
    userId: string;
    listingId: string;
    sellerWalletAddress: string;
    txSignature: string;
  }) {
    const tx = await this.fetchSuccessfulTransaction(input.txSignature);
    const hasSigner = tx.transaction.message
      .getAccountKeys()
      .staticAccountKeys.some(
        (key) => key.toBase58() === input.sellerWalletAddress,
      );
    if (!hasSigner) throw new BadRequestException("Invalid delist signer");
    const listingBefore = await this.marketplaceListingModel
      .findOne({
        listingId: input.listingId,
        sellerId: new Types.ObjectId(input.userId),
      })
      .lean()
      .exec();
    if (!listingBefore) throw new BadRequestException("Listing not found");
    const messageKeys = tx.transaction.message
      .getAccountKeys()
      .staticAccountKeys.map((key) => key.toBase58());
    if (!messageKeys.includes(this.marketplaceProgramId))
      throw new BadRequestException(
        "Transaction does not invoke marketplace program",
      );
    if (!messageKeys.includes(listingBefore.listingPda))
      throw new BadRequestException(
        "Transaction does not include expected listing PDA",
      );
    if (!this.transactionHasMarketplaceInstruction(tx, "delist_nft")) {
      throw new BadRequestException(
        "Transaction does not include delist_nft instruction",
      );
    }

    const listing = await this.marketplaceListingModel.findOneAndUpdate(
      {
        listingId: input.listingId,
        sellerId: new Types.ObjectId(input.userId),
      },
      {
        $set: {
          status: MarketplaceListingStatus.DELISTED,
          delistTxSignature: input.txSignature,
          delistedAt: new Date(),
        },
      },
      { new: true },
    );
    if (!listing) throw new BadRequestException("Listing not found");
    return { listingId: listing.listingId, status: listing.status };
  }

  async prepareMarketplaceBuy(input: {
    userId: string;
    buyerWalletAddress: string;
    listingId: string;
  }): Promise<{
    serializedTransaction: string;
    listingId: string;
    amountLamports: number;
  }> {
    const listing = await this.marketplaceListingModel.findOne({
      listingId: input.listingId,
    });
    if (!listing) throw new BadRequestException("Listing is unavailable");
    if (listing.sellerWalletAddress === input.buyerWalletAddress)
      throw new BadRequestException("Seller cannot buy own listing");

    const platformTreasury = this.configService.get<string>(
      "MARKETPLACE_PLATFORM_TREASURY",
    );
    if (!platformTreasury)
      throw new BadRequestException("Marketplace treasury not configured");

    const listingPda =
      listing.listingPda ||
      this.deriveListingPda({
        seller: new PublicKey(listing.sellerWalletAddress),
        mint: new PublicKey(listing.mint),
        projectPubkey: listing.projectPubkey
          ? new PublicKey(listing.projectPubkey)
          : this.projectIdToPubkey(listing.projectId.toString()),
      }).toBase58();

    const onChainStatus = await this.fetchOnChainListingStatus(listingPda);
    if (onChainStatus !== MarketplaceListingStatus.ACTIVE)
      throw new BadRequestException("Listing is not active on-chain");
    const escrowedToListing = await this.verifyNftOwnership(
      listing.mint,
      listingPda,
    );
    if (!escrowedToListing)
      throw new BadRequestException(
        "Listing is not escrowed to the marketplace PDA. Delist and relist this NFT before buying.",
      );

    const tx = await this.buildAnchorBuyTx({
      buyerWalletAddress: input.buyerWalletAddress,
      listingPda,
      mint: listing.mint,
      sellerWalletAddress: listing.sellerWalletAddress,
      platformTreasury,
    });

    return {
      serializedTransaction: tx,
      listingId: listing.listingId,
      amountLamports: listing.priceLamports,
    };
  }

  async confirmMarketplaceBuy(input: {
    userId: string;
    buyerWalletAddress: string;
    listingId: string;
    txSignature: string;
  }) {
    const tx = await this.fetchSuccessfulTransaction(input.txSignature);
    const hasBuyer = tx.transaction.message
      .getAccountKeys()
      .staticAccountKeys.some(
        (key) => key.toBase58() === input.buyerWalletAddress,
      );
    if (!hasBuyer) throw new BadRequestException("Invalid buyer signer");
    const listingBefore = await this.marketplaceListingModel
      .findOne({
        listingId: input.listingId,
      })
      .lean()
      .exec();
    if (!listingBefore) throw new BadRequestException("Listing not found");
    const messageKeys = tx.transaction.message
      .getAccountKeys()
      .staticAccountKeys.map((key) => key.toBase58());
    if (!messageKeys.includes(this.marketplaceProgramId))
      throw new BadRequestException(
        "Transaction does not invoke marketplace program",
      );
    if (!messageKeys.includes(listingBefore.listingPda))
      throw new BadRequestException(
        "Transaction does not include expected listing PDA",
      );
    if (!this.transactionHasMarketplaceInstruction(tx, "buy_nft")) {
      throw new BadRequestException(
        "Transaction does not include buy_nft instruction",
      );
    }

    let ownershipTransferred = false;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      ownershipTransferred = await this.verifyNftOwnership(
        listingBefore.mint,
        input.buyerWalletAddress,
      );
      if (ownershipTransferred) break;
      await this.sleep(500 * (attempt + 1));
    }
    if (!ownershipTransferred) {
      const [onChainStatus, currentOwner] = await Promise.all([
        this.fetchOnChainListingStatus(listingBefore.listingPda),
        this.getNftOwnerAddress(listingBefore.mint),
      ]);
      if (
        onChainStatus !== MarketplaceListingStatus.SOLD ||
        currentOwner !== input.buyerWalletAddress
      ) {
        throw new BadRequestException(
          `Payment transaction confirmed, but NFT ownership is still not transferred to buyer. currentOwner=${currentOwner || "unknown"} expectedOwner=${input.buyerWalletAddress} listingStatus=${onChainStatus || "unknown"}`,
        );
      }

      this.logger.warn(
        `Buy confirmation for listing ${listingBefore.listingId} required fallback verification. owner became buyer after delayed index propagation.`,
      );
      ownershipTransferred = true;
    }

    const listing = await this.marketplaceListingModel.findOneAndUpdate(
      {
        listingId: input.listingId,
      },
      {
        $set: {
          status: MarketplaceListingStatus.SOLD,
          buyTxSignature: input.txSignature,
          soldAt: new Date(),
          buyerId: new Types.ObjectId(input.userId),
          buyerWalletAddress: input.buyerWalletAddress,
        },
      },
      { new: true },
    );
    if (!listing) throw new BadRequestException("Listing not found");

    return { listingId: listing.listingId, status: listing.status };
  }

  async getMarketplaceListings(input: {
    page?: number;
    limit?: number;
    status?: MarketplaceListingStatus;
    mint?: string;
    projectId?: string;
  }) {
    const page = Math.max(1, input.page || 1);
    const limit = Math.min(50, Math.max(1, input.limit || 20));
    const query: Record<string, unknown> = {};
    if (input.status) query.status = input.status;
    if (input.mint) query.mint = input.mint;
    if (input.projectId) {
      if (!Types.ObjectId.isValid(input.projectId))
        throw new BadRequestException("Invalid projectId");
      query.projectId = new Types.ObjectId(input.projectId);
    }

    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.marketplaceListingModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.marketplaceListingModel.countDocuments(query),
    ]);

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async reconcileMarketplaceListings(): Promise<{ updated: number }> {
    const pending = await this.marketplaceListingModel
      .find({
        status: {
          $in: [
            MarketplaceListingStatus.PENDING_LIST,
            MarketplaceListingStatus.PENDING_DELIST,
            MarketplaceListingStatus.PENDING_BUY,
          ],
        },
      })
      .lean()
      .exec();

    let updated = 0;
    for (const listing of pending) {
      const onChainStatus = await this.fetchOnChainListingStatus(
        listing.listingPda,
      );
      if (!onChainStatus || onChainStatus === listing.status) continue;
      await this.marketplaceListingModel.updateOne(
        { _id: listing._id },
        { $set: { status: onChainStatus } },
      );
      updated += 1;
    }
    return { updated };
  }

  async checkIfProjectPurchased(projectId: string): Promise<{
    purchased: boolean;
  }> {
    const purchase = await this.purchaseModel.findOne({
      projectId: new Types.ObjectId(projectId),
      internalStatus: InternalPurchaseStatus.PAID,
    });

    if (!purchase) return { purchased: false };

    return {
      purchased: true,
    };
  }

  async getPurchaseAccessInternal(
    userId: string,
    projectId: string,
    walletAddress?: string,
  ): Promise<{
    hasAccess: boolean;
    isRefundable?: boolean;
    purchase?: PurchaseInterface;
  }> {
    if (!userId || !projectId) return { hasAccess: false };

    const userIdObj = new Types.ObjectId(userId);
    const projectIdObj = new Types.ObjectId(projectId);

    const purchase: PurchaseInterface | null = await this.purchaseModel.findOne(
      {
        userId: userIdObj,
        projectId: projectIdObj,
        internalStatus: InternalPurchaseStatus.PAID,
      },
    );

    if (purchase?.nftMint) {
      const expectedOwner = walletAddress || purchase.buyerWalletAddress;
      const hasOnChainOwnership = await this.verifyNftOwnership(
        purchase.nftMint,
        expectedOwner,
      );
      if (hasOnChainOwnership) {
        const { isRefundable } = this.getRefundEligibility(purchase);
        return {
          hasAccess: true,
          isRefundable,
          purchase,
        };
      }
    }

    if (!walletAddress) return { hasAccess: false };

    const anyProjectMint = await this.purchaseModel
      .findOne({
        projectId: projectIdObj,
        internalStatus: InternalPurchaseStatus.PAID,
        nftMint: { $exists: true, $ne: null },
      })
      .sort({ createdAt: 1 })
      .lean()
      .exec();
    if (!anyProjectMint?.nftMint) return { hasAccess: false };
    const hasOnChainOwnership = await this.verifyNftOwnership(
      anyProjectMint.nftMint,
      walletAddress,
    );
    if (!hasOnChainOwnership) return { hasAccess: false };

    return {
      hasAccess: true,
      isRefundable: false,
      purchase: anyProjectMint as unknown as PurchaseInterface,
    };
  }

  private getRefundEligibility(purchase: PurchaseInterface) {
    const isRefundable =
      purchase.internalStatus === InternalPurchaseStatus.PENDING;

    return {
      isRefundable,
    };
  }

  private buildMetadataUri(projectId: string, userId: string): string {
    const base = this.configService.get<string>(
      "PROJECT_NFT_METADATA_BASE_URI",
    );
    if (!base) {
      const fallbackBase =
        this.configService.get<string>("BACKEND_PUBLIC_URL") ||
        this.configService.get<string>("API_PUBLIC_URL") ||
        "http://localhost:4000";
      return `${fallbackBase.replace(
        /\/$/,
        "",
      )}/billing/purchases/metadata/${projectId}/${userId}.json`;
    }
    return `${base.replace(/\/$/, "")}/${projectId}/${userId}.json`;
  }

  async getProjectNftMetadata(
    projectId: string,
    userId: string,
  ): Promise<{
    name: string;
    description: string;
    image: string;
    attributes: Array<{ trait_type: string; value: string }>;
  }> {
    if (!Types.ObjectId.isValid(projectId))
      throw new BadRequestException("Invalid projectId");

    const project = await this.projectModel.findById(projectId).lean().exec();
    if (!project) throw new BadRequestException("Project not found");

    const imageBase =
      this.configService.get<string>("R2_IMAGE_PUBLIC_URL") || "";
    const thumbnailId = project.media?.thumbnailId?.trim();
    const isAbsoluteImageUrl =
      !!thumbnailId && /^https?:\/\//i.test(thumbnailId);

    const image = thumbnailId
      ? isAbsoluteImageUrl
        ? thumbnailId
        : imageBase
          ? `${imageBase.replace(/\/$/, "")}/${thumbnailId.replace(/^\/+/, "")}`
          : thumbnailId
      : "https://placehold.co/1200x1200/png?text=Cognios+Access+Pass";

    return {
      name: `Cognios Access Pass - ${project.title}`,
      description: `Access pass NFT for project "${project.title}" on Cognios.`,
      image,
      attributes: [
        { trait_type: "projectId", value: project._id.toString() },
        { trait_type: "creatorId", value: project.creatorId.toString() },
        { trait_type: "userId", value: userId },
        { trait_type: "timestamp", value: new Date().toISOString() },
        {
          trait_type: "literature",
          value: (project.literature || [])
            .map((item) => item.name)
            .filter(Boolean)
            .join(", "),
        },
      ],
    };
  }

  private buildListingId(input: {
    mint: string;
    projectId: string;
    sellerWalletAddress: string;
  }): string {
    return createHash("sha256")
      .update(`${input.mint}:${input.projectId}:${input.sellerWalletAddress}`)
      .digest("hex");
  }

  private projectIdToPubkey(projectId: string): PublicKey {
    const hash = createHash("sha256").update(`project:${projectId}`).digest();
    return new PublicKey(hash.subarray(0, 32));
  }

  private getMarketplaceProgramPubkey(): PublicKey {
    return new PublicKey(this.marketplaceProgramId);
  }

  private getMplCoreProgramPubkey(): PublicKey {
    const mplCoreProgramId = this.configService.get<string>(
      "MPL_CORE_PROGRAM_ID",
    );
    if (!mplCoreProgramId)
      throw new BadRequestException("MPL_CORE_PROGRAM_ID is not configured");
    return new PublicKey(mplCoreProgramId);
  }

  private getMarketplaceConfigPda(): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("marketplace-config")],
      this.getMarketplaceProgramPubkey(),
    );
    return pda;
  }

  private deriveListingPda(input: {
    seller: PublicKey;
    mint: PublicKey;
    projectPubkey: PublicKey;
  }): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("listing"),
        input.seller.toBuffer(),
        input.mint.toBuffer(),
        input.projectPubkey.toBuffer(),
      ],
      this.getMarketplaceProgramPubkey(),
    );
    return pda;
  }

  private buildAnchorDiscriminator(methodName: string): Buffer {
    return createHash("sha256")
      .update(`global:${methodName}`)
      .digest()
      .subarray(0, 8);
  }

  private transactionHasMarketplaceInstruction(
    tx: VersionedTransactionResponse,
    methodName: string,
  ): boolean {
    const staticKeys =
      tx.transaction.message.getAccountKeys().staticAccountKeys;
    const expectedDiscriminator = this.buildAnchorDiscriminator(methodName);

    return tx.transaction.message.compiledInstructions.some((ix) => {
      const programId = staticKeys[ix.programIdIndex]?.toBase58();
      if (programId !== this.marketplaceProgramId) return false;
      const dataBuffer = Buffer.from(ix.data);
      return (
        dataBuffer.length >= 8 &&
        dataBuffer.subarray(0, 8).equals(expectedDiscriminator)
      );
    });
  }

  private encodeListNftArgs(input: {
    projectPubkey: PublicKey;
    priceLamports: number;
    expiryTs: number;
  }): Buffer {
    const priceBuffer = Buffer.alloc(8);
    priceBuffer.writeBigUInt64LE(BigInt(input.priceLamports));
    const expiryBuffer = Buffer.alloc(8);
    expiryBuffer.writeBigInt64LE(BigInt(input.expiryTs));
    return Buffer.concat([
      input.projectPubkey.toBuffer(),
      priceBuffer,
      expiryBuffer,
    ]);
  }

  private async buildAnchorListTx(input: {
    sellerWalletAddress: string;
    mint: string;
    projectPubkey: PublicKey;
    priceLamports: number;
    expiryTs: number;
  }): Promise<string> {
    const connection = new Connection(this.solanaRpcUrl, "confirmed");
    const latestBlockhash = await connection.getLatestBlockhash("confirmed");
    const seller = new PublicKey(input.sellerWalletAddress);
    const mint = new PublicKey(input.mint);
    const configPda = this.getMarketplaceConfigPda();
    const mplCoreProgram = this.getMplCoreProgramPubkey();
    const listingPda = this.deriveListingPda({
      seller,
      mint,
      projectPubkey: input.projectPubkey,
    });

    const ixData = Buffer.concat([
      this.buildAnchorDiscriminator("list_nft"),
      this.encodeListNftArgs({
        projectPubkey: input.projectPubkey,
        priceLamports: input.priceLamports,
        expiryTs: input.expiryTs,
      }),
    ]);

    const tx = new Transaction({
      feePayer: seller,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    });
    tx.add(
      new TransactionInstruction({
        programId: this.getMarketplaceProgramPubkey(),
        keys: [
          { pubkey: seller, isSigner: true, isWritable: true },
          { pubkey: mint, isSigner: false, isWritable: false },
          { pubkey: configPda, isSigner: false, isWritable: true },
          { pubkey: listingPda, isSigner: false, isWritable: true },
          { pubkey: mint, isSigner: false, isWritable: true },
          { pubkey: mplCoreProgram, isSigner: false, isWritable: false },
          {
            pubkey: SystemProgram.programId,
            isSigner: false,
            isWritable: false,
          },
        ],
        data: ixData,
      }),
    );

    return tx
      .serialize({ verifySignatures: false, requireAllSignatures: false })
      .toString("base64");
  }

  private encodeInitializeArgs(input: { feeBps: number }): Buffer {
    const feeBuffer = Buffer.alloc(2);
    feeBuffer.writeUInt16LE(input.feeBps);
    return feeBuffer;
  }

  private async buildAnchorInitializeTx(input: {
    authorityWalletAddress: string;
    platformTreasury: string;
    feeBps: number;
  }): Promise<string> {
    const connection = new Connection(this.solanaRpcUrl, "confirmed");
    const latestBlockhash = await connection.getLatestBlockhash("confirmed");
    const authority = new PublicKey(input.authorityWalletAddress);
    const platformTreasury = new PublicKey(input.platformTreasury);
    const configPda = this.getMarketplaceConfigPda();

    const ixData = Buffer.concat([
      this.buildAnchorDiscriminator("initialize_marketplace"),
      this.encodeInitializeArgs({ feeBps: input.feeBps }),
    ]);

    const tx = new Transaction({
      feePayer: authority,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    });
    tx.add(
      new TransactionInstruction({
        programId: this.getMarketplaceProgramPubkey(),
        keys: [
          { pubkey: authority, isSigner: true, isWritable: true },
          { pubkey: platformTreasury, isSigner: false, isWritable: false },
          { pubkey: configPda, isSigner: false, isWritable: true },
          {
            pubkey: SystemProgram.programId,
            isSigner: false,
            isWritable: false,
          },
        ],
        data: ixData,
      }),
    );

    return tx
      .serialize({ verifySignatures: false, requireAllSignatures: false })
      .toString("base64");
  }

  private async buildAnchorDelistTx(input: {
    sellerWalletAddress: string;
    mint: string;
    listingPda: string;
  }): Promise<string> {
    const connection = new Connection(this.solanaRpcUrl, "confirmed");
    const latestBlockhash = await connection.getLatestBlockhash("confirmed");
    const seller = new PublicKey(input.sellerWalletAddress);
    const mint = new PublicKey(input.mint);
    const mplCoreProgram = this.getMplCoreProgramPubkey();
    const tx = new Transaction({
      feePayer: seller,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    });
    tx.add(
      new TransactionInstruction({
        programId: this.getMarketplaceProgramPubkey(),
        keys: [
          { pubkey: seller, isSigner: true, isWritable: true },
          {
            pubkey: new PublicKey(input.listingPda),
            isSigner: false,
            isWritable: true,
          },
          { pubkey: mint, isSigner: false, isWritable: true },
          { pubkey: mplCoreProgram, isSigner: false, isWritable: false },
          {
            pubkey: SystemProgram.programId,
            isSigner: false,
            isWritable: false,
          },
        ],
        data: this.buildAnchorDiscriminator("delist_nft"),
      }),
    );
    return tx
      .serialize({ verifySignatures: false, requireAllSignatures: false })
      .toString("base64");
  }

  private async buildAnchorBuyTx(input: {
    buyerWalletAddress: string;
    listingPda: string;
    mint: string;
    sellerWalletAddress: string;
    platformTreasury: string;
  }): Promise<string> {
    const connection = new Connection(this.solanaRpcUrl, "confirmed");
    const latestBlockhash = await connection.getLatestBlockhash("confirmed");
    const buyer = new PublicKey(input.buyerWalletAddress);
    const seller = new PublicKey(input.sellerWalletAddress);
    const treasury = new PublicKey(input.platformTreasury);
    const mint = new PublicKey(input.mint);
    const configPda = this.getMarketplaceConfigPda();
    const mplCoreProgram = this.getMplCoreProgramPubkey();

    const tx = new Transaction({
      feePayer: buyer,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    });
    tx.add(
      new TransactionInstruction({
        programId: this.getMarketplaceProgramPubkey(),
        keys: [
          { pubkey: buyer, isSigner: true, isWritable: true },
          { pubkey: configPda, isSigner: false, isWritable: true },
          {
            pubkey: new PublicKey(input.listingPda),
            isSigner: false,
            isWritable: true,
          },
          { pubkey: seller, isSigner: false, isWritable: true },
          { pubkey: treasury, isSigner: false, isWritable: true },
          { pubkey: mint, isSigner: false, isWritable: true },
          { pubkey: mplCoreProgram, isSigner: false, isWritable: false },
          {
            pubkey: SystemProgram.programId,
            isSigner: false,
            isWritable: false,
          },
        ],
        data: this.buildAnchorDiscriminator("buy_nft"),
      }),
    );

    return tx
      .serialize({ verifySignatures: false, requireAllSignatures: false })
      .toString("base64");
  }

  private async fetchSuccessfulTransaction(signature: string) {
    const normalizedSignature = signature?.trim();
    if (!normalizedSignature)
      throw new BadRequestException("txSignature is required");
    const isBase58 = /^[1-9A-HJ-NP-Za-km-z]+$/.test(normalizedSignature);
    if (
      !isBase58 ||
      normalizedSignature.length < 64 ||
      normalizedSignature.length > 128
    )
      throw new BadRequestException(
        "Invalid txSignature format. Expected a Solana transaction signature",
      );

    const connection = new Connection(this.solanaRpcUrl, "confirmed");
    let tx: VersionedTransactionResponse | null = null;
    try {
      tx = await connection.getTransaction(normalizedSignature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });
    } catch (error) {
      const message = (error as Error).message || "";
      if (message.includes("WrongSize")) {
        throw new BadRequestException(
          "Invalid txSignature size. Make sure you pass the tx signature returned by sendRawTransaction",
        );
      }
      throw error;
    }
    if (!tx) throw new BadRequestException("Transaction not found");
    if (tx.meta?.err) throw new BadRequestException("Transaction failed");
    return tx;
  }

  private async fetchOnChainListingStatus(
    listingPda: string,
  ): Promise<MarketplaceListingStatus | null> {
    try {
      const connection = new Connection(this.solanaRpcUrl, "confirmed");
      const accountInfo = await connection.getAccountInfo(
        new PublicKey(listingPda),
        "confirmed",
      );
      if (!accountInfo?.data || accountInfo.data.length < 121) return null;

      // Anchor account layout: 8 discriminator + Listing fields.
      // status offset = 8 + 32 + 32 + 32 + 8 + 8
      const statusOffset = 120;
      const status = accountInfo.data.readUInt8(statusOffset);
      if (status === 0) return MarketplaceListingStatus.ACTIVE;
      if (status === 1) return MarketplaceListingStatus.DELISTED;
      if (status === 2) return MarketplaceListingStatus.SOLD;
      return null;
    } catch (error) {
      this.logger.warn(
        `Failed to fetch on-chain listing ${listingPda}: ${(error as Error).message}`,
      );
      return null;
    }
  }

  private async verifyNftOwnership(
    mintAddress: string,
    expectedOwner: string,
  ): Promise<boolean> {
    try {
      const asset = await this.fetchAssetWithRetry(mintAddress);
      const owner = toWeb3JsPublicKey(asset.owner).toBase58();
      return owner === expectedOwner;
    } catch (error) {
      this.logger.warn(
        `Failed ownership check for mint ${mintAddress}: ${(error as Error).message}`,
      );
      return false;
    }
  }

  private async getNftOwnerAddress(
    mintAddress: string,
  ): Promise<string | null> {
    try {
      const asset = await this.fetchAssetWithRetry(mintAddress);
      return toWeb3JsPublicKey(asset.owner).toBase58();
    } catch (error) {
      this.logger.warn(
        `Failed to read owner for mint ${mintAddress}: ${(error as Error).message}`,
      );
      return null;
    }
  }

  private async fetchAssetWithRetry(mintAddress: string) {
    const umi = createUmi(this.solanaRpcUrl).use(mplCore());
    const maxAttempts = 8;
    const baseDelayMs = 600;

    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await fetchAssetV1(umi, publicKey(mintAddress));
      } catch (error) {
        lastError = error as Error;
        if (attempt === maxAttempts) break;
        await this.sleep(baseDelayMs * attempt);
      }
    }

    throw (
      lastError || new Error(`Failed to fetch asset at mint ${mintAddress}`)
    );
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  // private async getProjectForPurchase(projectId: string): Promise<{
  //   _id: string;
  //   price: number;
  //   currency: string;
  //   creatorId: string;
  //   title: string;
  //   slug: string;
  //   status: PROJECT_STATUS;
  //   error?: string;
  //   media: {
  //     thumbnailId: string;
  //     projectFile?: {
  //       fileKey: string;
  //     };
  //   };
  // }> {
  //   const internalSecret = this.configService.get<string>(
  //     "INTERNAL_SERVICE_SECRET",
  //   );
  //   const response = await firstValueFrom(
  //     this.httpService.get(
  //       `${this.projectsServiceUrl}/projects/${projectId}/internal`,
  //       {
  //         headers: {
  //           "x-internal-secret": internalSecret,
  //         },
  //       },
  //     ),
  //   );

  //   if (!response.data?.success || !response.data?.data)
  //     return {
  //       _id: "",
  //       price: 0,
  //       currency: "",
  //       status: "",
  //       creatorId: "",
  //       title: "",
  //       slug: "",
  //       status: PROJECT_STATUS.DRAFT,
  //       error: "Project not found",
  //       media: {
  //         thumbnailId: "",
  //       },
  //     };

  //   return response.data.data;
  // }

  // private calculatePlatformFee(
  //   platformFeePercentage: number, // e.g. 15
  //   priceInCents: number, // e.g. 900
  // ): {
  //   platformFeePercent: number;
  //   platformFeeAmount: number;
  //   creatorEarnings: number;
  // } {
  //   const platformFeePercent = platformFeePercentage ?? 0;

  //   if (platformFeePercent < 0 || platformFeePercent > 100)
  //     throw new Error("Invalid platform fee percentage");

  //   if (!Number.isInteger(priceInCents) || priceInCents < 0)
  //     throw new Error("Price must be a positive integer in cents");

  //   const platformFeeAmount = Math.round(
  //     (priceInCents * platformFeePercent) / 100,
  //   );

  //   const creatorEarnings = priceInCents - platformFeeAmount;

  //   return {
  //     platformFeePercent,
  //     platformFeeAmount,
  //     creatorEarnings,
  //   };
  // }

  // async updatePurchaseRefunded(purchaseId: string, refundReason: string) {
  //   const purchase = await this.purchaseModel.findByIdAndUpdate(purchaseId, {
  //     $set: {
  //       refunded: true,
  //       refundedAt: new Date(),
  //       refundReason,
  //     },
  //   });

  //   if (!purchase) return null;
  //   return purchase;
  // }

  // async getUserPurchases(
  //   userId: string,
  // ): Promise<UserPurchasesResponse[] | null> {
  //   const purchases = await this.purchaseModel
  //     .find({
  //       userId: new Types.ObjectId(userId),
  //       internalStatus: InternalPurchaseStatus.PAID,
  //       refunded: false,
  //     })
  //     .lean()
  //     .exec();

  //   if (!purchases || purchases.length === 0) return [];

  //   const userPurchases: UserPurchasesResponse[] = [];

  //   for (const purchase of purchases) {
  //     const project = await this.getProjectForPurchase(
  //       purchase.projectId.toString(),
  //     );
  //     const creator = await this.fetchUserData(purchase.creatorId.toString());

  //     if (!project) continue;

  //     userPurchases.push({
  //       title: project.title,
  //       slug: project.slug,
  //       thumbnailId: project.media.thumbnailId,
  //       creatorName: creator?.profileInfo?.username || "",
  //     });
  //   }

  //   return userPurchases;
  // }

  // async getCreatorEarnings(
  //   creatorId: string,
  // ): Promise<CreatorEarningsResponse | null> {
  //   const earnings = await this.purchaseModel
  //     .find({
  //       creatorId: new Types.ObjectId(creatorId),
  //       internalStatus: InternalPurchaseStatus.PAID,
  //       refunded: false,
  //     })
  //     .sort({ createdAt: -1 })
  //     .lean()
  //     .exec();

  //   if (!earnings) return null;

  //   const creatorEarnings: CreatorEarnings[] = [];
  //   let totalEarnings = 0;
  //   let totalSales = 0;
  //   let totalPrice = 0;

  //   for (const earning of earnings) {
  //     const project = await this.getProjectForPurchase(
  //       earning.projectId.toString(),
  //     );
  //     if (!project) continue;

  //     totalEarnings += earning.creatorEarningsAmount || 0;
  //     totalSales += 1;
  //     totalPrice += earning.priceAtPurchase || 0;

  //     creatorEarnings.push({
  //       _id: earning._id.toString(),
  //       creatorId: earning.creatorId.toString(),
  //       earnings: convertLamportsToSol(earning.creatorEarningsAmount || 0),
  //       price: convertLamportsToSol(earning.priceAtPurchase || 0),
  //       projectTitle: project.title,
  //       projectSlug: project.slug,
  //       projectCurrency: project.currency,
  //       internalStatus: earning.internalStatus || "",
  //       createdAt: earning.createdAt || null,
  //     });
  //   }

  //   return {
  //     creatorEarnings,
  //     totalSales,
  //     totalEarnings: convertLamportsToSol(totalEarnings),
  //     totalPrice: convertLamportsToSol(totalPrice),
  //   };
  // }

  // async getUserPayments(userId: string): Promise<UserPaymentsResponse | null> {
  //   const payments = await this.purchaseModel
  //     .find({
  //       userId: new Types.ObjectId(userId),
  //       internalStatus: InternalPurchaseStatus.PAID,
  //       refunded: false,
  //     })
  //     .lean()
  //     .exec();

  //   if (!payments) return null;

  //   const userPayments: UserPayments[] = [];
  //   let totalPayments = 0;

  //   for (const payment of payments) {
  //     const project = await this.getProjectForPurchase(
  //       payment.projectId.toString() || "",
  //     );
  //     if (!project) continue;

  //     totalPayments += payment.priceAtPurchase || 0;

  //     userPayments.push({
  //       _id: payment._id.toString(),
  //       price: convertLamportsToSol(payment.priceAtPurchase || 0),
  //       projectTitle: project.title,
  //       projectSlug: project.slug,
  //       projectCurrency: project.currency,
  //       internalStatus: payment.internalStatus || "",
  //       createdAt: payment.createdAt || null,
  //     });
  //   }

  //   return {
  //     userPayments,
  //     totalPayments: convertLamportsToSol(totalPayments),
  //   };
  // }

  // async markVideoPlaybackInitiated(
  //   userId: string | null,
  //   projectId: string,
  //   videoPlaybackUrl: string,
  // ) {
  //   if (!userId) throw new NotFoundException(`User ID is required`);
  //   const result = await this.purchaseModel.updateOne(
  //     {
  //       userId,
  //       projectId,
  //       videoPlaybackInitiatedAt: null,
  //       refunded: false,
  //     },
  //     {
  //       $set: {
  //         videoPlaybackInitiatedAt: new Date(),
  //         videoPlaybackUrl,
  //       },
  //     },
  //     {
  //       runValidators: false,
  //     },
  //   );

  //   if (result.matchedCount === 0) {
  //     const exists = await this.purchaseModel.exists({
  //       userId,
  //       projectId,
  //       refunded: false,
  //     });
  //     if (!exists) throw new ForbiddenException("Project not purchased");
  //   }

  //   return { success: true };
  // }

  // async getProjectsEligibleForRefund(
  //   userId: string,
  // ): Promise<ProjectsEligibleForRefundResponse[]> {
  //   const purchases = await this.purchaseModel
  //     .find({
  //       userId: new Types.ObjectId(userId),
  //       internalStatus: InternalPurchaseStatus.PAID,
  //       refunded: false,
  //     })
  //     .lean()
  //     .exec();

  //   if (!purchases || purchases.length === 0) return [];

  //   const userPurchases: ProjectsEligibleForRefundResponse[] = [];

  //   for (const purchase of purchases) {
  //     const { isRefundable } = this.getRefundEligibility(purchase);
  //     if (!isRefundable) continue;

  //     const project = await this.getProjectForPurchase(
  //       purchase.projectId.toString(),
  //     );
  //     if (!project) continue;

  //     userPurchases.push({
  //       _id: project._id.toString(),
  //       title: project.title,
  //       purchaseId: purchase._id.toString(),
  //     });
  //   }

  //   return userPurchases;
  // }

  // ///
  // /// ----------------------------- INTERNAL SERVICE-TO-SERVICE METHODS -----------------------------
  // ///

  // async updatePurchaseAccessInternal(purchaseId: string) {
  //   const purchase = await this.purchaseModel.findByIdAndUpdate(purchaseId, {
  //     $set: {
  //       pdfAccessed: true,
  //       pdfAccessedAt: new Date(),
  //       refundableUntil: null,
  //     },
  //   });

  //   if (!purchase) return null;
  //   return purchase;
  // }

  // async getSystemSettings(): Promise<SystemSettings> {
  //   const systemSettings = await this.systemSettingsModel.findOne({
  //     key: "main",
  //   });
  //   if (!systemSettings)
  //     throw new NotFoundException("System settings not found");
  //   return systemSettings;
  // }
}
