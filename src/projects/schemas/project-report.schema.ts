import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Schema as MongooseSchema } from "mongoose";
import { ProjectReportReason, ProjectReportStatus } from "../types/projects";

export type ProjectReportDocument = ProjectReport & Document;

@Schema({ timestamps: true })
export class ProjectReport {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: "Project",
    required: true,
    index: true,
  })
  projectId: MongooseSchema.Types.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    required: false,
    default: null,
    index: true,
  })
  userId: MongooseSchema.Types.ObjectId | null;

  @Prop({
    type: String,
    enum: Object.values(ProjectReportReason),
    required: true,
  })
  reason: ProjectReportReason;

  @Prop({ required: false })
  message?: string;

  @Prop({ default: Date.now, index: true })
  reportedAt: Date;

  @Prop({
    index: true,
    enum: Object.values(ProjectReportStatus),
    required: true,
    default: ProjectReportStatus.PENDING,
  })
  status: ProjectReportStatus;
}

export const ProjectReportSchema = SchemaFactory.createForClass(ProjectReport);

ProjectReportSchema.index({ projectId: 1, status: 1 });
