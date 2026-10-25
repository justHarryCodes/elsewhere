import { useCallback, useEffect, useRef, useState } from 'react';
import { Client, getStateCallbacks, type Room } from 'colyseus.js';
import {
  Messages,
  ROOM_NAME,
  SERVER_PORT,
  type ActionMessage,
  type HumanAnimation,
  type InputMessage,
  type JoinOptions,
  type PlayerSnapshot,
  type TeleportMessage,
  type DoorMessage,
} from '@game/shared';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

/** Live player objects keyed by session id; Colyseus mutates them in place as state arrives. */
export type PlayersRef = { readonly current: Map<string, PlayerSnapshot> };

const serverUrl =
  import.meta.env.VITE_SERVER_URL ??
  `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:${SERVER_PORT}`;

const client = new Client(serverUrl);

export function useGameRoom(options: JoinOptions = {}) {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [playerIds, setPlayerIds] = useState<string[]>([]);
  const [sessionId, setSessionId] = useState<string>();
  // The room picks the city; every client builds the same one from its seed.
  const [citySeed, setCitySeed] = useState<number>();
  const players = useRef(new Map<string, PlayerSnapshot>());
  const roomRef = useRef<Room | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    client
      .joinOrCreate(ROOM_NAME, options)
      .then((room) => {
        if (cancelled) {
          void room.leave();
          return;
        }
        roomRef.current = room;
        setSessionId(room.sessionId);
        setStatus('connected');

        const $ = getStateCallbacks(room);
        $(room.state).listen('citySeed', (seed: number) => setCitySeed(seed));
        $(room.state).players.onAdd((player: PlayerSnapshot, id: string) => {
          players.current.set(id, player);
          setPlayerIds((ids) => [...ids, id]);
        });
        $(room.state).players.onRemove((_player: PlayerSnapshot, id: string) => {
          players.current.delete(id);
          setPlayerIds((ids) => ids.filter((existing) => existing !== id));
        });

        room.onLeave(() => setStatus('disconnected'));
      })
      .catch((error) => {
        console.error('Failed to join room', error);
        if (!cancelled) setStatus('error');
      });

    return () => {
      cancelled = true;
      void roomRef.current?.leave();
      roomRef.current = undefined;
      players.current.clear();
      setPlayerIds([]);
    };
    // Join once per mount; options are only read on join.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendInput = useCallback((input: InputMessage) => {
    roomRef.current?.send(Messages.Input, input);
  }, []);

  const sendAction = useCallback((animation: HumanAnimation) => {
    roomRef.current?.send(Messages.Action, { animation } satisfies ActionMessage);
  }, []);

  const sendTeleport = useCallback((x: number, z: number) => {
    roomRef.current?.send(Messages.Teleport, { x, z } satisfies TeleportMessage);
  }, []);

  const sendDoor = useCallback((home = false) => {
    roomRef.current?.send(Messages.Door, { home } satisfies DoorMessage);
  }, []);

  return { status, players: players as PlayersRef, playerIds, sessionId, citySeed, sendInput, sendAction, sendTeleport, sendDoor };
}
