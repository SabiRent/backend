import cloudinary from '@/config/cloudinary.config';

export interface UploadedImage {
  secureUrl: string;
  publicId: string;
}

// cloudinary.uploader.upload_stream gives us a writable stream; we pipe the in-memory
// buffer from multer into it, and its callback fires once the upload finishes.
export const uploadImageBuffer = (buffer: Buffer, folder: string): Promise<UploadedImage> => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream({ folder }, (error, result) => {
      if (error || !result) {
        reject(error ?? new Error('Cloudinary upload failed'));
        return;
      }

      resolve({ secureUrl: result.secure_url, publicId: result.public_id });
    });

    uploadStream.end(buffer);
  });
};

export const deleteImage = async (publicId: string) => {
  await cloudinary.uploader.destroy(publicId);
};
