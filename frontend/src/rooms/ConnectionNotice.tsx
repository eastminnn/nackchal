import type { ConnectionStatus } from './protocol';

const labels: Readonly<Record<ConnectionStatus, string>> = {
  connecting: '대기실에 연결하는 중…',
  connected: '실시간 연결됨',
  reconnecting: '연결이 끊겼어요. 다시 연결하는 중… 자리는 30초 동안 유지돼요.',
  stopped: '연결이 종료됐어요. 로그인 상태를 확인해 주세요.',
};
export function ConnectionNotice({ status }: { readonly status: ConnectionStatus }) {
  return (
    <span className="room-connection" data-connection={status} role="status">
      {labels[status]}
    </span>
  );
}
