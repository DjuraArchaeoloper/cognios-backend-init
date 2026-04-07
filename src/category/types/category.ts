export type MetadataCategoryResponse = {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  keywords?: string[];
  isActive?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
};
