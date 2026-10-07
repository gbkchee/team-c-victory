# Figma 디자인·UX 구현 상태
2026-10-07 갱신. 지정 Figma 화면을 구현하고 사용자 지정 위치 TEAMC/github/team-c-victory로 원격 저장소의 초기 이력과 이전 프로젝트 커밋을 합쳤습니다.
2026-10-07 갱신. 지정 디자인을 읽고 구현했으며, 사용자 요청에 따라 코드와 커밋 이력을 `team-c-victory` 체크아웃으로 옮겼습니다.

## 현재 작업 위치

- 프로젝트: `/Users/shyun.lee/Desktop/personal/TEAMC/github/team-c-victory`
- 이전 폴더: `/Users/shyun.lee/Desktop/personal/TEAMC/c-team-strategy` (이전 커밋 상태로 보존)
- 원격: `https://github.com/gbkchee/team-c-victory.git`
- 브랜치: `main`
- 디자인: `https://www.figma.com/design/2Y070IdVZKJyqQldInTYnG/Untitled?node-id=5-621`
- 파일 키: `2Y070IdVZKJyqQldInTYnG`, 노드: `5:621`, 원본 프레임: 390 × 4300

## 반영한 내용

Figma `figma-design-to-code` 스킬과 `get_design_context`로 고해상도 디자인 코드·스크린샷을 확인했습니다. 빌드 의존성이 없는 기존 HTML/CSS/JavaScript 구조를 유지했습니다.

- #F4F8FF 배경, #003A70 강조색, 흰색 헤더와 카드, 파란 밑줄 탭.
- COURT MATES 로고, 정모 소개, 테니스 코트 일러스트, 더 보기 메뉴.
- C·A·B·D조 바로가기와 세로 섹션, 모바일 두 열·데스크톱 네 열 카드.
- 공식 31명과 조별 실제 인원수, 등급순·가나다순 정렬.
- C조 카드에는 본인이 선택한 플레이·특징, 상대 조에는 관찰 강점·약점. 입력·초기화 시 목록 카드도 즉시 갱신.
- 원래 제목과 배경 없는 포티 4️⃣·써티 3️⃣·러브 🫶 유지.
- 기존 선수 편집 팝업, 키워드 추가·삭제·저장, 세 전략·밸런스 세 안, 출전표, 독립 페어 분석, 공유 링크 유지.
- 기존 전략·분석·편집 팝업에 공통 색상과 둥근 카드 스타일 적용.

Figma 예시의 가상 이름·숫자 등급·잘못된 인원수·가상 데이터 안내는 공식 데이터와 기존 입력 요구에 맞춰 바꿨습니다. C조의 미선택 항목을 약점으로 해석하지 않습니다. Figma의 고정 프레임 하단 빈 공간 대신 실제 콘텐츠 높이를 사용합니다.

## 원본 정적 에셋

로컬 DNS 제한으로 임시 에셋 URL을 받을 수 없어 `figma-use` 스킬과 읽기 전용 `use_figma`의 `exportAsync({format: 'SVG'})`로 아래 원본 노드를 그대로 내보냈습니다. Figma 파일은 수정하지 않았습니다. SVG 루트 치수와 HTML 표시 치수를 일치시켰으며 이미지 크기를 덮어쓰는 CSS는 없습니다.

| 파일 | 원본 노드 | 치수 | 사용 위치 |
| --- | --- | --- | --- |
| `assets/club-emblem.svg` | `5:625` | 28 × 28 | 클럽 이름 왼쪽 |
| `assets/ellipsis.svg` | `5:1044` | 24 × 24 | 헤더 더 보기 버튼 |
| `assets/court-illustration.svg` | `5:634` | 88 × 106 | 정모 소개 오른쪽 |
| `assets/crown.svg` | `10:2` | 15 × 15 | C조 바로가기 |
| `assets/heart-handshake.svg` | `5:1056` | 24 × 24 | 하단 응원 문구 위 |

`build.cjs`가 `assets/`까지 `dist/`로 복사합니다. 임시 Figma URL이나 스크린샷을 화면 구현에 사용하지 않습니다.

## 검증과 남은 확인

- `npm run build`: 모든 기존 모델·편성 검사 통과, 정적 배포 파일 생성.
- `node --check app.js`, `node --check ratings.js`, `git diff --check`: 통과.
- `/private/tmp/teamc-figma-dom-check.cjs`: 기존 DOM 모형을 확장해 31명·C조 우선 배치, 조별 이동과 초점, 더 보기 열기·Esc·외부 클릭 닫기, 카드 즉시 갱신과 기존 탭·프로필·전략·출전표·상대 분석·공유 복원을 검증.
- 원본 SVG 5개의 비어 있지 않은 파일, 루트 치수, HTML 사용 위치와 치수, `dist/` 복사를 확인.
- 실제 브라우저 검증은 미완료. Edge가 SIGABRT로 종료되고 WebKit은 LaunchServices sandbox extension을 만들지 못해 렌더링하지 못했습니다. 정상 브라우저에서 390px·320px·데스크톱 화면, 메뉴, 팝업, 긴 카드 요약과 출전표를 시각 확인해야 합니다. 픽셀 일치를 검증했다고 주장하지 않습니다.

선수 입력은 localStorage에만 저장됩니다. Firebase·로그인·실제 AI 호출·입력에 따른 자동 편성은 아직 연결되지 않았습니다. 기존 공식 20경기, 전원 5경기·동시간 중복 금지·러브끼리 금지·제출 후 변경 제한은 유지합니다.

## GitHub와 산출물

디자인 구현은 기존 프로젝트 a214656 커밋부터 이어집니다. 새 체크아웃의 GitHub 원격 초기 커밋 61ce4e2와 병합해 두 이력을 보존합니다. push 결과를 확인한 뒤 이 문서를 갱신합니다.

소스 ZIP: /Users/shyun.lee/Desktop/personal/TEAMC/github/team-c-victory-source.zip

배포 ZIP: /Users/shyun.lee/Desktop/personal/TEAMC/github/team-c-victory-pages.zip

배포 ZIP에 든 HTML·CSS·JavaScript 파일과 assets/를 함께 배포해야 합니다.
