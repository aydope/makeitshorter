import mongoose from "mongoose";

class GracefulShutdown {
  constructor(server, options = {}) {
    this.server = server;
    this.timeout = options.timeout || 10000;
    this.exitOnUnhandled = options.exitOnUnhandled ?? true;
    this.onShutdown = options.onShutdown || null;
    this.isShuttingDown = false;
    this.forceExitTimer = null;
    this.cleanupTasks = [];
  }

  addCleanupTask(task) {
    if (typeof task === "function") {
      this.cleanupTasks.push(task);
    }
    return this;
  }

  async executeCleanupTasks() {
    for (const task of this.cleanupTasks) {
      await task();
    }
  }

  async closeHttpServer() {
    if (!this.server) return;

    await new Promise((resolve) => {
      this.server.close((err) => {
        if (err) {
          console.error("Error closing HTTP server:", err.message);
        } else {
          console.log("HTTP server closed");
        }
        resolve();
      });
    });
  }

  async closeDatabaseConnections() {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close(false);
      console.log("MongoDB connection closed");
    }
  }

  setupForceExitTimer() {
    this.forceExitTimer = setTimeout(() => {
      console.error(`Force exit after ${this.timeout}ms timeout`);
      process.exit(1);
    }, this.timeout);
  }

  clearForceExitTimer() {
    if (this.forceExitTimer) {
      clearTimeout(this.forceExitTimer);
      this.forceExitTimer = null;
    }
  }

  async shutdown(signal, error = null) {
    if (this.isShuttingDown) {
      console.log(`Shutdown already in progress, ignoring ${signal}`);
      return;
    }

    this.isShuttingDown = true;
    console.log(`\nGraceful shutdown initiated (Signal: ${signal})`);

    if (error) {
      console.error("Error details:", {
        message: error.message,
        stack: error.stack,
      });
    }

    this.setupForceExitTimer();

    try {
      if (this.onShutdown && typeof this.onShutdown === "function") {
        console.log("Running custom shutdown hook...");
        await this.onShutdown();
        console.log("Custom shutdown hook completed");
      }

      console.log("Closing HTTP server...");
      await this.closeHttpServer();

      console.log("Closing database connections...");
      await this.closeDatabaseConnections();

      console.log("Executing cleanup tasks...");
      await this.executeCleanupTasks();

      console.log("Shutdown complete successfully\n");
      this.clearForceExitTimer();
      process.exit(0);
    } catch (error) {
      console.error("Shutdown error:", error.message);
      console.error("Stack:", error.stack);
      this.clearForceExitTimer();
      process.exit(1);
    }
  }

  initialize() {
    const signals = ["SIGTERM", "SIGINT", "SIGQUIT"];

    signals.forEach((signal) => {
      process.on(signal, () => this.shutdown(signal));
    });

    process.on("unhandledRejection", (error) => {
      console.error("Unhandled Rejection:", {
        message: error.message,
        stack: error.stack,
      });

      if (this.exitOnUnhandled) {
        this.shutdown("unhandledRejection", error);
      }
    });

    process.on("uncaughtException", (error) => {
      console.error("Uncaught Exception:", {
        message: error.message,
        stack: error.stack,
      });
      this.shutdown("uncaughtException", error);
    });

    process.on("warning", (warning) => {
      console.warn("Process Warning:", warning.message);
    });

    return this;
  }

  getStatus() {
    return {
      isShuttingDown: this.isShuttingDown,
      cleanupTasksCount: this.cleanupTasks.length,
      hasServer: !!this.server,
    };
  }
}

const setupGracefulShutdown = (server, options = {}) => {
  const shutdownHandler = new GracefulShutdown(server, options);
  return shutdownHandler.initialize();
};

export { GracefulShutdown, setupGracefulShutdown };
export default setupGracefulShutdown;
