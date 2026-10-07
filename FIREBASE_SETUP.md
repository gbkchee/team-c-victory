# Firebase 연결 설정

정적 페이지는 GitHub Pages에 두고 선수 입력은 Firebase Authentication의 익명 인증을 거쳐 Cloud Firestore에 저장합니다. 로그인 화면은 없으며, 링크에 접속한 사용자는 선수 프로필을 읽고 수정할 수 있습니다. 브라우저 저장값은 네트워크 연결 전 임시 보관 및 기존 입력 이관에 사용합니다.

## Firebase 콘솔 설정

1. **Authentication → 시작하기 → 로그인 방법**에서 **익명(Anonymous)** 로그인을 사용 설정합니다.
2. **Firestore Database → 규칙**에서 최신 `firestore.rules` 내용을 게시합니다. 인증된 사용자는 프로필 컬렉션을 읽을 수 있고, 쓰기는 선수 ID·데이터 형식으로 제한합니다. 선수별 특징은 20개까지 허용합니다.
3. 새 GitHub Pages 배포 후 사이트의 더 보기 메뉴에 `팀원과 실시간으로 공유 중`이 표시되는지 확인합니다.

Firebase CLI를 쓸 수 있으면 저장소 루트에서 규칙을 게시합니다.

```sh
firebase login
firebase deploy --only firestore:rules
```

`firebase.json`과 `.firebaserc`는 Firestore 규칙 배포 대상을 지정합니다.

## Firestore 데이터

- `playerProfiles/{조:이름}`: 포지션, 스타일, 자신 있는 기술, 집 나간 기술, 상대 선수 관찰 키워드
- `playerTraits/{C조:이름}`: 선수별 플레이 특징. 최대 20개, 항목당 40자
- `traitSuggestions/{해시}`: 추가된 특징을 다른 선수 팝업의 공용 빠른 추가에 표시

처음 연결할 때 기존 `localStorage` 입력 중 서버에 없는 선수 문서만 이관합니다. 이미 서버에 있는 문서는 브라우저의 오래된 내용으로 덮어쓰지 않습니다.

익명 인증은 링크를 아는 누구나 입력할 수 있게 하는 편의 설정입니다. 팀원만 입력하게 제한하려면 계정 로그인과 허용 사용자 규칙으로 바꿔야 합니다.
