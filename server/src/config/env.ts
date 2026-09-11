import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '5040', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1h',
  get mongodbUri(): string {
    const uri = process.env.MONGODB_URI;
    if (!uri || uri.trim() === '') {
      throw new Error(
        '[CONFIG ERROR] MONGODB_URI environment variable is missing. Application cannot start without a valid MongoDB connection string.'
      );
    }
    return uri;
  },
};
