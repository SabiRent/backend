import { FileVisibility, StorageProvider } from '@/constants/storage';
import { type HydratedDocument, type InferSchemaType, Schema, model } from 'mongoose';

const fileSchema = new Schema(
  {
    // --- storage backend ---
    provider: {
      type: String,
      enum: Object.values(StorageProvider),
      required: true,
    },
    providerFileId: { type: String, required: true },
    url: { type: String, required: true },

    // --- file metadata ---
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    visibility: {
      type: String,
      enum: Object.values(FileVisibility),
      default: FileVisibility.PUBLIC,
      required: true,
    },

    // --- context ---
    // Logical grouping so one File collection serves any upload context
    // (property photos, tenant ID documents, ...). The association to an owning
    // record is held by that record (it stores the file id), not here.
    folder: { type: String },

    // Provider-specific bits needed to later sign or delete the object.
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

fileSchema.index({ provider: 1, providerFileId: 1 });

export type FileSchema = InferSchemaType<typeof fileSchema>;
export type FileDocument = HydratedDocument<FileSchema>;

const FileModel = model('File', fileSchema);

export default FileModel;
