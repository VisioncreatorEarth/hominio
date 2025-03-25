import { LoroDoc } from 'loro-crdt';

export const CLIENT_PEER_ID = 'localhost:client:1';
export const SERVER_PEER_ID = 'localhost:server:1';

export interface PeerSyncState {
    id: string;
    lastKnownHash: string;
    lastSyncedAt: number;
}

export interface DocSyncState {
    currentHash: string;
    lastSyncedAt: number;
    peers: {
        client: PeerSyncState;
        server: PeerSyncState;
    }
}

export class SyncService {
    initDocWithSyncState(doc: LoroDoc) {
        // Initialize maps
        const sync = doc.getMap('sync');
        const clientPeer = doc.getMap('sync.peers.client');
        const serverPeer = doc.getMap('sync.peers.server');

        // Initialize sync state
        sync.set('currentHash', '');
        sync.set('lastSyncedAt', Date.now());

        // Add client peer
        clientPeer.set('id', CLIENT_PEER_ID);
        clientPeer.set('lastKnownHash', '');
        clientPeer.set('lastSyncedAt', Date.now());

        // Add server peer
        serverPeer.set('id', SERVER_PEER_ID);
        serverPeer.set('lastKnownHash', '');
        serverPeer.set('lastSyncedAt', Date.now());

        return doc;
    }

    updateSyncState(doc: LoroDoc, newHash: string, peerId: string) {
        const sync = doc.getMap('sync');
        const peer = doc.getMap(`sync.peers.${peerId === CLIENT_PEER_ID ? 'client' : 'server'}`);

        sync.set('currentHash', newHash);
        sync.set('lastSyncedAt', Date.now());

        peer.set('lastKnownHash', newHash);
        peer.set('lastSyncedAt', Date.now());
    }

    getSyncState(doc: LoroDoc): DocSyncState {
        const sync = doc.getMap('sync');
        const clientPeer = doc.getMap('sync.peers.client');
        const serverPeer = doc.getMap('sync.peers.server');

        return {
            currentHash: sync.get('currentHash') as string,
            lastSyncedAt: sync.get('lastSyncedAt') as number,
            peers: {
                client: {
                    id: clientPeer.get('id') as string,
                    lastKnownHash: clientPeer.get('lastKnownHash') as string,
                    lastSyncedAt: clientPeer.get('lastSyncedAt') as number
                },
                server: {
                    id: serverPeer.get('id') as string,
                    lastKnownHash: serverPeer.get('lastKnownHash') as string,
                    lastSyncedAt: serverPeer.get('lastSyncedAt') as number
                }
            }
        };
    }

    isPeerSynced(doc: LoroDoc, peerId: string): boolean {
        const state = this.getSyncState(doc);
        const peer = peerId === CLIENT_PEER_ID ? state.peers.client : state.peers.server;
        return peer.lastKnownHash === state.currentHash;
    }
}

export const syncService = new SyncService(); 