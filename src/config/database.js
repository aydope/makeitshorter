import mongoose from "mongoose";
import { Configs } from "./env.js";

const CONNECTION_STATES = {
  0: "Disconnected",
  1: "Connected",
  2: "Connecting",
  3: "Disconnecting",
};

class DatabaseConnection {
  constructor() {
    this.isConnected = false;
    this.connectionAttempts = 0;
    this.maxRetries = 3;
    this.retryDelay = 5000;
  }

  initializeEventListeners() {
    mongoose.connection.on("connected", () => {
      this.isConnected = true;
      console.log("MongoDB connected successfully");
      this.logConnectionState();
    });

    mongoose.connection.on("error", (error) => {
      console.error("MongoDB connection error:", error.message);
      this.isConnected = false;
    });

    mongoose.connection.on("disconnected", () => {
      console.warn("MongoDB disconnected");
      this.isConnected = false;
      this.logConnectionState();
    });

    mongoose.connection.on("reconnected", () => {
      this.isConnected = true;
      console.log("MongoDB reconnected successfully");
    });
  }

  logConnectionState() {
    const state = mongoose.connection.readyState;
    console.log(
      `Connection State: ${CONNECTION_STATES[state] || "Unknown"} (${state})`,
    );
  }

  async connect(retryCount = 0) {
    try {
      if (this.isConnected && mongoose.connection.readyState === 1) {
        console.log("MongoDB already connected");
        return mongoose.connection;
      }

      if (retryCount === 0) {
        this.initializeEventListeners();
      }

      console.log(
        `Connecting to MongoDB... ${
          retryCount > 0 ? `(Attempt ${retryCount + 1}/${this.maxRetries})` : ""
        }`,
      );

      const options = {
        autoIndex: process.env.NODE_ENV !== "production",
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        family: 4,
        maxPoolSize: 10,
        minPoolSize: 2,
        connectTimeoutMS: 10000,
        heartbeatFrequencyMS: 30000,
      };

      await mongoose.connect(Configs.MONGODB_URI, options);
      await mongoose.connection.db.admin().ping();
      this.isConnected = true;

      return mongoose.connection;
    } catch (error) {
      console.error("Failed to connect to MongoDB:", error.message);
      this.isConnected = false;

      if (retryCount < this.maxRetries - 1) {
        console.log(
          `Retrying connection in ${this.retryDelay / 1000} seconds...`,
        );
        await this.wait(this.retryDelay);
        return this.connect(retryCount + 1);
      }

      console.error("Max connection attempts reached. Exiting...");
      process.exit(1);
    }
  }

  async disconnect() {
    try {
      if (mongoose.connection.readyState !== 0) {
        console.log("Disconnecting from MongoDB...");
        await mongoose.disconnect();
        this.isConnected = false;
        console.log("MongoDB disconnected");
      } else {
        console.log("MongoDB already disconnected");
      }
    } catch (error) {
      console.error("Error disconnecting from MongoDB:", error.message);
      throw error;
    }
  }

  getStatus() {
    const state = mongoose.connection.readyState;
    return {
      state: CONNECTION_STATES[state] || "Unknown",
      stateCode: state,
      isConnected: this.isConnected,
    };
  }

  async ping() {
    try {
      if (mongoose.connection.readyState === 1) {
        await mongoose.connection.db.admin().ping();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

const dbConnection = new DatabaseConnection();

export const connectDB = () => dbConnection.connect();
export const disconnectDB = () => dbConnection.disconnect();
export const getDBStatus = () => dbConnection.getStatus();
export const pingDB = () => dbConnection.ping();

export { DatabaseConnection };
export default dbConnection;
