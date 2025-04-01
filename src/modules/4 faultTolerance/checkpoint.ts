import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { Message, Checkpoint } from '../../types/types';
import {logError, logInfo } from '../../utils/logger';

export class CheckpointManager {
  private dbPath: string;
  private db: Database.Database;
  private nodId: string;
  private checkpointInterval: number;
  private intervalId: NodeJS.Timeout | null = null;
  private getCallbackMessages: () => Message[];

  constructor(
    nodId: string,
    basePath: string,
    checkpointInterval: number,
    getCallbackMessages: () => Message[]
  ) {
    this.nodId = nodId;

    if (!fs.existsSync(basePath)) {
      fs.mkdirSync(basePath, { recursive: true });
      logInfo(`Created directory: ${basePath}`);
    }

    this.dbPath = path.join(basePath, `${nodId}-checkpoint.db`);
    this.checkpointInterval = checkpointInterval;
    this.getCallbackMessages = getCallbackMessages;

    this.db = new Database(this.dbPath);
    this.initDatabase();
  }

  private initDatabase() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS checkpoints (
        id TEXT PRIMARY KEY,
        node_id TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        data TEXT NOT NULL
      );
    `);

    logInfo(`Checkpoint database initialized at ${this.dbPath}`);
  }

  public init(){
    logInfo(`Starting checkpoint manager with interval of ${this.checkpointInterval}ms`);

    this.intervalId = setInterval(() => {
      this.createCheckpoint();
    }, this.checkpointInterval);
  }

  public stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logInfo('Checkpoint manager stopped');
    }
  }

  public createCheckpoint(): string {
    try{
      const messages = this.getCallbackMessages();
      const timestamp = Date.now();
      const checkpointId = `${this.nodId}-${timestamp}`;

      const checkpoint: Checkpoint = {
        id: checkpointId,
        messages,
        timestamp
      };

      const stmt = this.db.prepare(
        'INSERT INTO checkpoints (id, node_id, timestamp, data) VALUES (?, ?, ?, ?)'
      )

      stmt.run(checkpointId, this.nodId, timestamp, JSON.stringify(checkpoint.messages));

      logInfo(`Checkpoint ${checkpointId} created with ${messages.length} messages`);
      return checkpointId
    }catch(e){
      logError(`Error creating checkpoint: ${e}`);
      return '';
    }
  }

  public getLastCheckpoint(): Checkpoint | null {
    try{
      const row = this.db.prepare(
        'SELECT id, node_id, timestamp, data FROM checkpoints WHERE node_id = ? ORDER BY timestamp DESC LIMIT 1'
      ).get(this.nodId) as { id: string; node_id: string; timestamp: number; data: string };

      if(!row){
        logInfo('No checkpoints found');
        return null;
      }

      const checkpoint: Checkpoint = {
        id: row.id,
        messages: JSON.parse(row.data),
        timestamp: row.timestamp
      };

      logInfo(`Last checkpoint found: ${checkpoint.id} with ${checkpoint.messages.length} messages`);
      return checkpoint;
    } catch(e){
      logError(`Error getting last checkpoint: ${e}`);
      return null;
    }
  }

  public recoverState() : Message[] {
    const checkpoint = this.getLastCheckpoint();

    if(!checkpoint){
      logInfo('No checkpoints found');
      return [];
    }

    logInfo(`Recovering state from checkpoint ${checkpoint.id} (${new Date(checkpoint.timestamp).toLocaleString()})`);

    return checkpoint.messages;
  }

  public listCheckpoints(): {id: string, timestamp: number, messagesQtd: number}[] {
    try{
      const rows = this.db.prepare(
        'SELECT id, timestamp, data FROM checkpoints WHERE node_id = ? ORDER BY timestamp DESC'
      ).all(this.nodId) as { id: string; timestamp: number; data: string }[];

      return rows.map((row) => ({
        id: row.id,
        timestamp: row.timestamp,
        messagesQtd: JSON.parse(row.data).length
      }));
    } catch(e){
      logError(`Error listing checkpoints: ${e}`);
      return [];
    }
  }

  public close(){
    this.stop();
    this.db.close();
    logInfo('Checkpoint manager closed');
  }
}

export function simulateFailure() : boolean {
  return Math.random() < 0.1; // 10% chance of failure
}