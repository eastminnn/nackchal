import { useId } from 'react';
import type { ObjectKind } from '../../game/types';

export function ObjectArt({
  kind,
  className = '',
}: {
  readonly kind: ObjectKind;
  readonly className?: string;
}) {
  const id = useId().replaceAll(':', '');
  const mint = `url(#${id}mint)`;
  const cream = `url(#${id}cream)`;
  const metal = `url(#${id}metal)`;
  const art = (() => {
    switch (kind) {
      case 'radio':
        return (
          <g transform="rotate(-7 160 130)">
            <path d="M114 67V46Q162 24 205 50V70" stroke="#40634e" strokeWidth="13" fill="none" />
            <path d="M218 68L270 15" stroke={metal} strokeWidth="6" />
            <rect x="49" y="64" width="227" height="135" rx="22" fill="#40634e" />
            <rect
              x="40"
              y="59"
              width="225"
              height="133"
              rx="22"
              fill={mint}
              stroke="#789780"
              strokeWidth="2"
            />
            <rect x="57" y="80" width="132" height="90" rx="11" fill={cream} />
            {[89, 97, 105, 113, 121, 129, 137, 145, 153, 161].map((y) => (
              <path key={y} d={`M67 ${y}H180`} stroke="#a59e82" strokeWidth="3" />
            ))}
            <circle cx="224" cy="105" r="24" fill="#725719" />
            <circle cx="222" cy="102" r="19" fill={cream} />
            <path d="M222 101L231 89" stroke="#725719" strokeWidth="3" />
            <circle cx="222" cy="150" r="12" fill={metal} />
            <path d="M54 187V201M245 189V201" stroke="#725719" strokeWidth="9" strokeLinecap="round" />
          </g>
        );
      case 'camera':
        return (
          <g transform="rotate(-8 160 130)">
            <path d="M98 70L110 49H164L176 70" fill="#64675e" />
            <rect x="46" y="69" width="229" height="122" rx="20" fill={metal} />
            <rect x="47" y="97" width="226" height="70" fill="#40634e" />
            <circle cx="166" cy="128" r="56" fill="#272b27" />
            <circle cx="164" cy="125" r="43" fill={metal} />
            <circle cx="164" cy="125" r="32" fill="#3f607c" />
            <circle cx="156" cy="116" r="12" fill="#dee8ef" opacity=".55" />
            <rect x="224" y="81" width="32" height="19" rx="4" fill="#fffefa" />
            <rect x="66" y="58" width="25" height="12" rx="4" fill="#dd471d" />
          </g>
        );
      case 'lamp':
        return (
          <g>
            <ellipse cx="160" cy="201" rx="61" ry="12" fill="#40634e" />
            <path d="M160 197V103" stroke={metal} strokeWidth="11" />
            <path d="M111 40H209L245 127Q160 147 76 127Z" fill={mint} stroke="#789780" strokeWidth="2" />
            <ellipse cx="160" cy="128" rx="84" ry="13" fill={cream} />
            <path d="M200 135V166" stroke="#725719" strokeWidth="2" />
            <circle cx="200" cy="168" r="4" fill="#725719" />
          </g>
        );
      case 'shoe':
        return (
          <g transform="rotate(-8 160 140)">
            <path
              d="M53 84L108 100L146 74L185 135Q215 148 265 154L278 184Q169 211 43 183Z"
              fill={cream}
              stroke="#bba889"
              strokeWidth="3"
            />
            <path d="M83 95L134 118L191 151L161 166L96 132L56 130V87Z" fill="#dd471d" />
            <path
              d="M43 181Q170 205 279 181V195Q165 221 42 197Z"
              fill="#fffefa"
              stroke="#bba889"
              strokeWidth="2"
            />
            <path d="M125 102L153 91M136 116L166 106M148 130L178 123" stroke="#fffefa" strokeWidth="6" />
          </g>
        );
      case 'teapot':
        return (
          <g>
            <path d="M222 97Q298 64 270 151L224 171" fill="none" stroke="#40634e" strokeWidth="19" />
            <path d="M107 122L43 85L61 164L112 176" fill={mint} />
            <ellipse cx="169" cy="143" rx="76" ry="65" fill={mint} />
            <ellipse cx="168" cy="91" rx="47" ry="12" fill="#40634e" />
            <ellipse cx="166" cy="83" rx="46" ry="10" fill={mint} />
            <circle cx="165" cy="67" r="12" fill="#40634e" />
            <path d="M127 123Q109 157 139 184" fill="none" stroke="#fffefa" strokeWidth="8" opacity=".6" />
          </g>
        );
      case 'duck':
        return (
          <g>
            <ellipse cx="164" cy="159" rx="89" ry="49" fill="#e7be64" />
            <circle cx="123" cy="96" r="48" fill={cream} />
            <path d="M93 100L48 112L96 127" fill="#dd471d" />
            <circle cx="113" cy="86" r="6" fill="#272b27" />
            <path d="M198 166Q252 157 264 116Q279 174 232 187" fill="#e7be64" />
            <path d="M144 159Q175 137 203 161Q179 185 149 177" fill="#f3df9b" />
          </g>
        );
      case 'clock':
        return (
          <g>
            <path d="M106 191L95 210M216 191L228 210" stroke="#725719" strokeWidth="11" />
            <path
              d="M78 64Q90 23 130 47M190 47Q231 23 244 64"
              fill="#e7be64"
              stroke="#725719"
              strokeWidth="5"
            />
            <circle cx="160" cy="127" r="80" fill={metal} />
            <circle cx="160" cy="127" r="68" fill={cream} />
            {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((angle) => (
              <path
                key={angle}
                d="M160 68V76"
                transform={`rotate(${angle} 160 127)`}
                stroke="#725719"
                strokeWidth="3"
              />
            ))}
            <path
              d="M160 91V129L193 145"
              fill="none"
              stroke="#272b27"
              strokeWidth="6"
              strokeLinecap="round"
            />
            <circle cx="160" cy="127" r="6" fill="#dd471d" />
          </g>
        );
      case 'plant':
        return (
          <g>
            <path d="M158 149V60M158 109L125 84M159 123L199 96" stroke="#40634e" strokeWidth="7" />
            <ellipse cx="122" cy="75" rx="31" ry="17" transform="rotate(35 122 75)" fill={mint} />
            <ellipse cx="193" cy="89" rx="34" ry="17" transform="rotate(-35 193 89)" fill="#789780" />
            <ellipse cx="161" cy="51" rx="17" ry="30" transform="rotate(10 161 51)" fill="#40634e" />
            <path d="M108 139H213L197 209H125Z" fill="#dd471d" />
            <ellipse cx="160" cy="139" rx="53" ry="12" fill="#c83a14" />
            <ellipse cx="160" cy="140" rx="42" ry="7" fill="#725719" />
            <path d="M158 142V129" stroke="#40634e" strokeWidth="6" />
          </g>
        );
      case 'controller':
        return (
          <g transform="rotate(-8 160 130)">
            <path
              d="M93 77Q53 73 46 130L32 178Q38 214 67 191L106 158H215L253 192Q282 210 287 180L272 125Q265 73 227 77Z"
              fill={cream}
              stroke="#bba889"
              strokeWidth="3"
            />
            <path d="M78 100H93V116H109V132H93V149H78V132H61V116H78Z" fill="#64675e" />
            <circle cx="230" cy="109" r="10" fill="#dd471d" />
            <circle cx="251" cy="130" r="10" fill="#e7be64" />
            <circle cx="210" cy="130" r="10" fill="#789780" />
            <circle cx="230" cy="152" r="10" fill="#715a84" />
            <path d="M143 133H154M169 133H180" stroke="#64675e" strokeWidth="8" strokeLinecap="round" />
          </g>
        );
      case 'vase':
        return (
          <g>
            <path
              d="M135 31H189L185 82Q257 143 217 194Q164 229 111 194Q73 142 139 82Z"
              fill={mint}
              stroke="#789780"
              strokeWidth="2"
            />
            <ellipse cx="162" cy="33" rx="28" ry="7" fill="#40634e" />
            <path d="M142 87Q101 154 132 182" stroke="#fffefa" strokeWidth="10" fill="none" opacity=".6" />
            <path d="M113 157Q162 179 222 153" stroke="#40634e" strokeWidth="4" fill="none" opacity=".4" />
          </g>
        );
      case 'tomato':
        return (
          <g>
            <ellipse cx="161" cy="146" rx="76" ry="64" fill="#c83a14" />
            <ellipse cx="150" cy="134" rx="69" ry="58" fill="#dd471d" />
            <ellipse
              cx="123"
              cy="117"
              rx="18"
              ry="10"
              transform="rotate(-30 123 117)"
              fill="#fffefa"
              opacity=".3"
            />
            <path
              d="M157 85L116 62L139 91L107 104L147 104L165 120L173 98L208 87L177 83L182 57Z"
              fill="#40634e"
            />
            <path d="M158 85L164 54" stroke="#40634e" strokeWidth="8" strokeLinecap="round" />
          </g>
        );
      case 'can':
        return (
          <g transform="rotate(18 160 128)">
            <path d="M109 62H213V197Q162 218 109 197Z" fill={metal} stroke="#85877f" strokeWidth="2" />
            <ellipse cx="161" cy="62" rx="52" ry="15" fill={metal} stroke="#85877f" strokeWidth="3" />
            <ellipse cx="161" cy="62" rx="36" ry="8" fill="#64675e" />
            <path
              d="M112 93Q162 108 211 93M112 125Q162 140 211 125M112 158Q162 173 211 158M112 187Q162 202 211 187"
              fill="none"
              stroke="#85877f"
              strokeWidth="3"
            />
          </g>
        );
    }
  })();
  return (
    <svg className={`object-art ${className}`} viewBox="0 0 320 240" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}mint`} x2=".8" y2="1">
          <stop stopColor="#dce9dc" />
          <stop offset=".5" stopColor="#a3bbaa" />
          <stop offset="1" stopColor="#789780" />
        </linearGradient>
        <linearGradient id={`${id}cream`} x2=".6" y2="1">
          <stop stopColor="#fffefa" />
          <stop offset="1" stopColor="#e3c097" />
        </linearGradient>
        <linearGradient id={`${id}metal`}>
          <stop stopColor="#85877f" />
          <stop offset=".25" stopColor="#fffefa" />
          <stop offset=".6" stopColor="#dedbd1" />
          <stop offset="1" stopColor="#85877f" />
        </linearGradient>
      </defs>
      <ellipse cx="163" cy="216" rx="105" ry="10" fill="#272b27" opacity=".09" />
      {art}
    </svg>
  );
}
