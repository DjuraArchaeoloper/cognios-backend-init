import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { AuthModule } from "./auth/auth.module";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { PurchasesModule } from "./purchases/purchases.module";
import { RefundsModule } from "./refunds/refunds.module";
import { ImageModule } from "./image/image.module";
import { FileModule } from "./file/file.module";
import { VideoModule } from "./video/video.module";
import { MediaModule } from "./media/media.module";
import { CategoryModule } from "./category/category.module";
import { SubcategoryModule } from "./subcategory/subcategory.module";
import { ProjectsModule } from "./projects/projects.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.getOrThrow<string>("MONGO_URI"),
      }),
    }),
    AuthModule,
    ProjectsModule,
    PurchasesModule,
    RefundsModule,
    ImageModule,
    FileModule,
    VideoModule,
    MediaModule,
    CategoryModule,
    SubcategoryModule,
    UsersModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
