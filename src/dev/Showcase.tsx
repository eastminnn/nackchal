import { Avatar } from '../components/art/Avatar';
import { ObjectArt } from '../components/art/ObjectArt';
import { Badge, Button, Cash } from '../components/ui/primitives';

export function Showcase() {
  return (
    <main className="container showcase lobby-shell">
      <h1>nackchal · components</h1>
      <div className="panel">
        <h2>Actions</h2>
        <div className="cluster">
          <Button>경매 시작하기</Button>
          <Button variant="secondary">게임 방법</Button>
          <Button variant="ghost">로비로</Button>
          <Button disabled>입찰할 수 없어요</Button>
        </div>
        <label className="field">
          닉네임
          <input placeholder="어떤 이름으로 참여할까요?" />
        </label>
      </div>
      <div className="panel">
        <h2>Players & objects</h2>
        <div className="cluster">
          {[0, 1, 2, 3].map((index) => (
            <div className="showcase-avatar" key={index}>
              <Avatar index={index} />
            </div>
          ))}
          <Badge live>경매 진행 중</Badge>
          <Cash amount={12} />
        </div>
        <div className="showcase-objects">
          {(['radio', 'camera', 'tomato', 'can'] as const).map((kind) => (
            <ObjectArt key={kind} kind={kind} />
          ))}
        </div>
      </div>
    </main>
  );
}
