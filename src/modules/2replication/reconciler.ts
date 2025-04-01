import fs from 'fs';
import path from 'path';
import { Message } from '../../types/types';
import { Replicator } from './replication';
import { logDebug, logError, logInfo } from '../../utils/logger';

export class Reconciler {
  private replicator: Replicator
  private intervalExecution: number;
  private intervalId: NodeJS.Timeout | null = null;

  constructor(replicator: Replicator, intervalExecution: number = 10_000) {
    this.replicator = replicator;
    this.intervalExecution = intervalExecution;
  }

  public start() {
    logInfo(`Starting reconciler with interval of ${this.intervalExecution}ms`);

    this.intervalId = setInterval(() => {
      this.reconcile();
    }, this.intervalExecution);
  }

  public stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logInfo('Reconciler stopped');
    }
  }


  public reconcile() {
    logInfo('Starting reconciliation process');

    try {
      const allMessages: Map<number, Message[]> = this.replicator.getAllMessages();

      const uniqueMessages: Map<string, Message> = new Map();

      allMessages.forEach((messages) => {
        messages.forEach((message) => {
          if (!uniqueMessages.has(message.id) ||
            uniqueMessages.get(message.id)!.timestamp < message.timestamp
          ) {
            uniqueMessages.set(message.id, message);
          }
        });
      });

      let foundedInconsistencies = false;
      allMessages.forEach((messages, replicaId) => {
        const actualReplicaIds = new Set(messages.map((message) => message.id));

        const missingMessages = Array.from(uniqueMessages.values()).filter(m => !actualReplicaIds.has(m.id));

        if (missingMessages.length > 0) {
          foundedInconsistencies = true;
          logInfo(`Replica ${replicaId} is missing ${missingMessages.length} messages. Syncing...`);

          missingMessages.forEach((message) => {
            this.replicator.saveMessage(message);
          });
        }
      })

      if (!foundedInconsistencies) {
        logInfo('No inconsistencies found');
      } else {
        logInfo('Reconciliation process completed');
      }
    } catch (error) {
      logError(`Error during reconciliation: ${error}`);
    }
  }
}