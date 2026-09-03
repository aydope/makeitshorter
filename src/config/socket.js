class SocketManager {
  constructor() {
    this.io = null;
    this.isInitialized = false;
    this.initializationTime = null;
  }

  init(ioInstance) {
    if (!ioInstance) {
      throw new Error("Socket.io instance is required for initialization");
    }

    if (this.isInitialized) {
      console.warn(
        "Socket.io is already initialized. Returning existing instance.",
      );
      return this.io;
    }

    this.io = ioInstance;
    this.isInitialized = true;
    this.initializationTime = new Date();

    if (typeof global !== "undefined") {
      global.__io = ioInstance;
    }

    return this.io;
  }

  getIO() {
    if (!this.io && typeof global !== "undefined" && global.__io) {
      this.io = global.__io;
      this.isInitialized = true;
      this.initializationTime = new Date();
    }

    if (!this.io || !this.isInitialized) {
      throw new Error(
        "Socket.io is not initialized. Call initSocket(io) before using socket features.",
      );
    }

    return this.io;
  }

  getStatus() {
    return {
      isInitialized: this.isInitialized,
      initializationTime: this.initializationTime,
      hasInstance: !!this.io,
    };
  }

  reset() {
    this.io = null;
    this.isInitialized = false;
    this.initializationTime = null;

    if (typeof global !== "undefined") {
      delete global.__io;
    }
  }
}

const socketManager = new SocketManager();

export const initSocket = (ioInstance) => socketManager.init(ioInstance);
export const getIO = () => socketManager.getIO();
export const getSocketStatus = () => socketManager.getStatus();
export const resetSocket = () => socketManager.reset();

export { SocketManager };
export default socketManager;
