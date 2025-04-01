import { ControlMessage, ControlMessageType } from "../../types/types";
import { logDebug, logInfo, logWarning } from "../../utils/logger";

export class MutualExclusion {
  private nodeId: string;
  private isResourceWaiting: boolean = false;
  private isResourceExisting: boolean = false;
  private timestamp: number = 0;
  private queue: {nodeId: string, timestamp: number}[] = [];
  private receivedMessages: Set<string> = new Set();
  private knownNodes: Set<string> = new Set();
  private sendCallback: (message: ControlMessage) => void;
  private receivedResourceCallback: () => void;

  constructor(
    nodeId: string,
    sendCallback: (message: ControlMessage) => void,
    receivedResourceCallback: () => void
  ) {
    this.nodeId = nodeId;
    this.sendCallback = sendCallback;
    this.receivedResourceCallback = receivedResourceCallback;
  }

  public processMessage(message: ControlMessage) {
    this.knownNodes.add(message.originNode);
    
    switch (message.type) {
      case ControlMessageType.REQUEST:
        this.processRequest(message);
        break;
      case ControlMessageType.RESPONSE:
        this.processResponse(message);
        break;
      case ControlMessageType.RELEASE:
        this.processRelease(message);
        break;
    }
  }


  public requestResource() {
    if(this.isResourceWaiting){
      logWarning(`Node ${this.nodeId} is already waiting for a resource`);
      return;
    }

    if(this.isResourceExisting){
      logWarning(`Node ${this.nodeId} is already having a resource`);
      return;
    }

    this.timestamp++;
    
    this.isResourceWaiting = true;
    this.receivedMessages.clear();

    logInfo(`Node ${this.nodeId} is requesting a resource with timestamp ${this.timestamp}`);

    // Se não houver outros nós conhecidos, concede o recurso imediatamente
    if(this.knownNodes.size === 0){
      this.giveResource();
      return;
    }

    const message: ControlMessage = {
      type: ControlMessageType.REQUEST,
      originNode: this.nodeId,
      timestamp: this.timestamp
    }

    this.sendCallback(message);
    this.verifyResponse();
  }

  public releaseResource(){
    if(!this.isResourceExisting){
      logWarning(`Node ${this.nodeId} is not having a resource`);
      return;
    }

    logInfo(`Node ${this.nodeId} is releasing shared resource`);

    this.isResourceExisting = false;
    this.isResourceWaiting = false;

    const message: ControlMessage = {
      type: ControlMessageType.RELEASE,
      originNode: this.nodeId,
      timestamp: this.timestamp
    }

    this.sendCallback(message);

    this.processQueue();
  }

  private processRequest(message: ControlMessage){
    logDebug(`Node ${this.nodeId} received request from ${message.originNode} with timestamp ${message.timestamp}`);

    if(
      this.isResourceExisting ||this.isResourceWaiting && 
      (
        this.timestamp < message.timestamp ||
        (
          this.timestamp === message.timestamp &&
          this.nodeId < message.originNode
        )
      )
    ) {
      this.queue.push({
        nodeId: message.originNode,
        timestamp: message.timestamp
      })
      logDebug(`Node ${this.nodeId} added ${message.originNode} to queue`);
    } else {
      this.sendResponse(message.originNode);
    }
  }


  private sendResponse(destination: string){
    const response: ControlMessage = {
      type: ControlMessageType.RESPONSE,
      originNode: this.nodeId,
      timestamp: this.timestamp
    }

    logDebug(`Node ${this.nodeId} is sending response to ${destination}`);
    this.sendCallback(response);
  }

  private processResponse(message: ControlMessage){
    if (!this.isResourceWaiting) {
      return;
    }

    logDebug(`Node ${this.nodeId} received response from ${message.originNode} with timestamp ${message.timestamp}`);

    this.receivedMessages.add(message.originNode);

    this.verifyResponse();

  }

  private verifyResponse() {
    if(this.receivedMessages.size >= this.knownNodes.size){
      this.giveResource();
    }
  }

  private giveResource(){
    this.isResourceExisting = true;
    this.isResourceWaiting = false;

    logInfo('Resource granted with success');

    this.receivedResourceCallback();
  }

  private processRelease(message: ControlMessage){
    logDebug(`Node ${this.nodeId} received release from ${message.originNode} with timestamp ${message.timestamp}`);

    this.processQueue();
  }


  private processQueue(){
    if(this.queue.length > 0){
      this.queue.sort((a, b) => {
        if(a.timestamp !== b.timestamp){
          return a.timestamp - b.timestamp;
        }
        return a.nodeId.localeCompare(b.nodeId);
      })
    }

    while(this.queue.length > 0){
      const next = this.queue.shift()!;
      this.sendResponse(next.nodeId);
    }
  }

  public addKnownNode(nodeId: string){
    if(nodeId !== this.nodeId) {
      this.knownNodes.add(nodeId);
      logDebug(`Node ${this.nodeId} added known node ${nodeId}`);
    }
  }

  public getStatus(): {isWaiting: boolean, isExisting: boolean} {
    return {
      isWaiting: this.isResourceWaiting,
      isExisting: this.isResourceExisting
    };
  }
}