import dgram from  'dgram';
import {Message, ControlMessage} from '../../types/types';
import { logDebug, logError, logInfo } from '../../utils/logger';

export class MulticastCommunicator {
  private socket: dgram.Socket;
  private address: string;
  private port: number;
  private nodeId: string;
  private messageCallback!: (msg: Message | ControlMessage) => void;

  constructor(
    nodeId: string,
    address: string,
    port: number,
    messageCallback: (msg: Message | ControlMessage) => void
  ) {
    this.nodeId = nodeId;
    this.address = address;
    this.port = port;
    this.messageCallback = messageCallback;

    this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    this.setupSocketEvents();
  }

  private setupSocketEvents() {
    this.socket.on('error', (err) => {
      logError(`Socket error: ${err.message}`);
      this.socket.close();
    })

    this.socket.on('message', (msg, info) => {
      try{
        const data = JSON.parse(msg.toString()) as Message | ControlMessage;
        if ((data as Message).origin === this.nodeId || (data as ControlMessage).originNode === this.nodeId) {
          // Ignorar mensagens enviadas pelo próprio nó
          return;
        }

        logDebug(`Received message from ${info.address}:${info.port} - ${msg.toString()}`);

        // Enviar para o callback de processamento
        this.messageCallback(data);
      } catch (error) {
        logError(`Error processing message: ${error}`);
      }
    })

    this.socket.on('listening', () => {
      const address = this.socket.address();
      logDebug(`Multicast socket listening on ${address.address}:${address.port}`);

      this.socket.addMembership(this.address);
      logInfo(`Joined multicast group ${this.address}:${this.port}`);
    })
  }

  public start(){
    this.socket.bind(this.port, () => {
      logInfo(`Node ${this.nodeId} starting on group ${this.address}:${this.port}`);
    })
  }

  public sendMessage(msg: Message | ControlMessage) {
    const messageBuffer = Buffer.from(JSON.stringify(msg));
    this.socket.send(messageBuffer, 0, messageBuffer.length, this.port, this.address, (err) => {
      if (err) {
        logError(`Error sending message: ${err.message}`);
      } else {
        logDebug(`Sent message to ${this.address}:${this.port} - ${JSON.stringify(msg)}`);
      }
    })
  }

  public stop(){
    this.socket.dropMembership(this.address);
    this.socket.close(() => {
      logInfo(`Node ${this.nodeId} left multicast group ${this.address}:${this.port}`);
    })
  }
}