import { LAMPORTS_PER_SOL } from "@solana/web3.js";

export const convertLamportsToSol = (amount: number) => {
  return Number(amount / LAMPORTS_PER_SOL);
};

export const convertSolToLamports = (amount: number) => {
  return Number(amount * LAMPORTS_PER_SOL);
};
