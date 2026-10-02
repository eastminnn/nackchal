import { ChatCircleDotsIcon, PaperPlaneRightIcon } from '@phosphor-icons/react';
import { type FormEvent, useLayoutEffect, useRef, useState } from 'react';
import type { GameTransport, Chat as Message } from '../../game/types';
import { Button } from '../ui/primitives';

export function ChatComposer({ server }: { readonly server: GameTransport }) {
  const [body, setBody] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!body.trim()) return;
    server.send({ type: 'SEND_CHAT', payload: { body } });
    if (!server.getSnapshot().error) setBody('');
  };
  return (
    <form className="chat-composer" onSubmit={submit}>
      <ChatCircleDotsIcon size={20} aria-hidden="true" />
      <input
        aria-label="채팅 메시지"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={100}
        placeholder="친구들에게 한마디…"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && e.nativeEvent.isComposing) e.preventDefault();
        }}
      />
      <Button variant="icon" type="submit" disabled={!body.trim()} aria-label="채팅 보내기">
        <PaperPlaneRightIcon size={22} />
      </Button>
    </form>
  );
}
export function ChatLog({ messages }: { readonly messages: readonly Message[] }) {
  const log = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  useLayoutEffect(() => {
    if (messages.length && follow.current && log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [messages]);
  return (
    <div
      ref={log}
      className="chat-log"
      role="log"
      aria-label="채팅 기록"
      aria-live="polite"
      onScroll={(event) => {
        const node = event.currentTarget;
        follow.current = node.scrollHeight - node.scrollTop - node.clientHeight < 32;
      }}
    >
      {messages.length === 0 ? (
        <p className="muted">아직 조용하네요. 먼저 한마디 해볼까요?</p>
      ) : (
        messages.map((message) => (
          <p key={`${message.playerId}-${message.id}`}>
            <strong>{message.name}</strong> <span>{message.body}</span>
          </p>
        ))
      )}
      {messages.length > 0 && (
        <button
          className="chat-scroll-end"
          type="button"
          title="방향키 또는 Page Up/Down으로 채팅 기록을 읽을 수 있어요."
          onKeyDown={(event) => {
            const node = log.current;
            if (!node) return;
            const steps: Readonly<Record<string, number>> = {
              ArrowUp: -40,
              ArrowDown: 40,
              PageUp: -node.clientHeight,
              PageDown: node.clientHeight,
              Home: -node.scrollHeight,
              End: node.scrollHeight,
            };
            const step = steps[event.key];
            if (step === undefined) return;
            event.preventDefault();
            node.scrollTop += step;
          }}
          onClick={() => {
            if (log.current) log.current.scrollTop = log.current.scrollHeight;
            follow.current = true;
          }}
        >
          최신 메시지로
        </button>
      )}
    </div>
  );
}
