import mongoose from "mongoose";

export default async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri)
    throw new Error(
      "MONGODB_URI is required. Create server/.env using .env.example.",
    );
  if (!/^mongodb(\+srv)?:\/\//.test(uri))
    throw new Error("MONGODB_URI must use mongodb:// or mongodb+srv://.");
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  console.log("MongoDB connected");
}
