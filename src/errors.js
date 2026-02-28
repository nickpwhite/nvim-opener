export class OpenerError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "OpenerError";
    this.details = details;
  }
}

export class CommandError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "CommandError";
    this.details = details;
  }
}
