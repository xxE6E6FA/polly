import { describe, expect, mock, test } from "bun:test";
import type { Id } from "@convex/_generated/dataModel";
import {
  type ChatInputStoreApi,
  type ChatInputStoreState,
  createChatInputStore,
  getChatKey,
} from "@/stores/chat-input-store";
import type { Attachment } from "@/types";

type RecordedCall = any[];

const createRecordingStore = () => {
  const calls: RecordedCall[] = [];
  const store = {
    getState: () => createChatInputStore().getState(),
    getInitialState: () => createChatInputStore().getState(),
    setState: (...args: any[]) => {
      calls.push(args);
    },
    subscribe: () => () => undefined,
  } as ChatInputStoreApi;

  return { store, calls };
};

const loadActions = async () => {
  mock.restore();
  return (await import(
    "./chat-input-actions?actual"
  )) as typeof import("./chat-input-actions");
};

describe("stores/actions/chat-input-actions", () => {
  test("append/remove attachments works and ignores invalid index", async () => {
    const { appendAttachments, removeAttachmentAt } = await loadActions();
    const key = getChatKey("c1");
    const { store, calls } = createRecordingStore();

    appendAttachments(
      "c1",
      [{ type: "image", url: "u", name: "n", size: 1 } as Attachment],
      store
    );
    expect(calls).toHaveLength(1);
    const appendCall = calls.shift();
    expect(appendCall).toBeDefined();
    const [appendUpdater, appendReplace] = appendCall as RecordedCall;
    expect(appendReplace).toBe(true);

    const baseState = createChatInputStore().getState();
    const appendedState = (
      appendUpdater as (state: ChatInputStoreState) => ChatInputStoreState
    )(baseState);
    expect(appendedState.attachmentsByKey[key]).toHaveLength(1);

    removeAttachmentAt("c1", 1, store);
    expect(calls).toHaveLength(1);
    const noopCall = calls.shift();
    expect(noopCall).toBeDefined();
    const [noopUpdater] = noopCall as RecordedCall;
    const afterInvalidRemoval = (
      noopUpdater as (state: ChatInputStoreState) => ChatInputStoreState
    )(appendedState);
    expect(afterInvalidRemoval.attachmentsByKey[key]).toHaveLength(1);

    removeAttachmentAt("c1", 0, store);
    expect(calls).toHaveLength(1);
    const removeCall = calls.shift();
    expect(removeCall).toBeDefined();
    const [removeUpdater] = removeCall as RecordedCall;
    const afterRemoval = (
      removeUpdater as (state: ChatInputStoreState) => ChatInputStoreState
    )(appendedState);
    expect(afterRemoval.attachmentsByKey[key]).toHaveLength(0);
  });

  test("set persona and temperature delegate to store", async () => {
    const {
      setPersona: setPersonaAction,
      setTemperature: setTemperatureAction,
    } = await loadActions();
    const store = createChatInputStore();
    const key = getChatKey("c2");

    setPersonaAction("c2", "p1" as Id<"personas">, store);
    expect(store.getState().selectedByKey[key]).toBe("p1");

    setTemperatureAction("c2", 0.6, store);
    expect(store.getState().temperatureByKey[key]).toBe(0.6);
  });
});
