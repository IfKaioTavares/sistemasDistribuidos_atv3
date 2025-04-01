export interface Message {
  id: string;
  origin: string;
  content: string;
  timestamp: number;
}

export enum ControlMessageType {
  REQUEST = "REQUEST",
  RESPONSE = "RESPONSE",
  RELEASE = "RELEASE"
}

export interface ControlMessage {
  type: ControlMessageType;
  originNode: string;
  timestamp: number;
}

export interface Checkpoint {
  id: string;
  messages: Message[];
  timestamp: number;
}

export interface NodeConfiguration {
  id: string;
  multicastAddress: string;
  multicastPort: number;
  replicasPath: string;
  checkpointInterval: number;
}
