import fs from 'fs';
import path from 'path';
import { Message } from '../../types/types';
import { logDebug, logError, logInfo } from '../../utils/logger';

export class Replicator {
  private basePath: string;
  private replicasNumber: number;
  private maxDelay: number;

  constructor(basePath: string, replicasNumber: number, maxDelay: number) {
    this.basePath = basePath;
    this.replicasNumber = replicasNumber;
    this.maxDelay = maxDelay;

    this.initializeReplicas();
  }

  private initializeReplicas() {
    if(!fs.existsSync(this.basePath)){
      fs.mkdirSync(this.basePath, { recursive: true });
    }

    for (let i = 1; i <= this.replicasNumber; i++) {
      const replicaPath = path.join(this.basePath, `replica_${i}`);
      if (!fs.existsSync(replicaPath)) {
        fs.mkdirSync(replicaPath, { recursive: true });
      }
    }

    logInfo(`${this.replicasNumber} replicas initialized in ${this.basePath}`);
  }

  public saveMessage(message: Message) {
    for (let i = 1; i <= this.replicasNumber; i++) {
      const delay = Math.floor(Math.random() * this.maxDelay);

      setTimeout(() => {
        const replicaPath = path.join(this.basePath, `replica_${i}`);
        const filePath = path.join(replicaPath, `${message.id}.json`);

        fs.writeFile(filePath, JSON.stringify(message), (err) => {
          if (err) {
            logError(`Error saving message to replica ${i}: ${err}`);
          } else {
            logDebug(`Message ${message.id} saved to replica ${i} after ${delay}ms`);
          }
        });
      }, delay);
    }
  }

  public getReplicaMessage(replicaNumber: number) {
    try {
      const replicaPath = path.join(this.basePath, `replica_${replicaNumber}`);
      const files = fs.readdirSync(replicaPath);

      const messages: Message[] = [];

      for (const file of files) {
        if (file.endsWith('.json')) {
          const content = fs.readFileSync(path.join(replicaPath, file), 'utf-8');
          const message: Message = JSON.parse(content);
          messages.push(message);
        }
      }

      return messages.sort((a, b) => a.timestamp - b.timestamp);
    } catch (error) {
      logError(`Error reading replica ${replicaNumber}: ${error}`);
      return [];
    }
  }

  public getAllMessages(): Map<number, Message[]> {
    const allMessages = new Map<number, Message[]>();

    for (let i = 1; i <= this.replicasNumber; i++) {
      const messages = this.getReplicaMessage(i);
      allMessages.set(i, messages);
    }

    return allMessages;
  }
}