# Firebase 연결·AI 배포·선수 입력 초기화

프로젝트는 `team-c-victory`입니다. 화면은 GitHub Pages, 공유 데이터는 Firebase 익명 인증·Cloud Firestore, AI는 서울 리전의 Firebase Functions에서 처리합니다.

## 선수 입력과 추천 연결

1. Firebase 콘솔 **Authentication → 로그인 방법 → 익명**을 사용 설정합니다.
2. **Firestore Database → 규칙**에 이 저장소의 최신 `firestore.rules` 전체 내용을 게시합니다. 이전 규칙은 새 프로필·확정표·공용 상대 키워드에 접근할 수 없습니다. 새 페이지 배포 전에 게시하세요.
3. `main`을 원격에 푸시하고 GitHub Actions의 Pages 배포 성공을 확인합니다.
4. 페이지 더 보기 메뉴에 **팀원과 실시간으로 공유 중입니다.**가 표시되는지 확인합니다.

Firebase CLI를 사용하면 저장소 루트에서 다음과 같이 규칙을 게시할 수 있습니다. Node.js 22 이상을 사용합니다.

```sh
npm install -g firebase-tools
firebase login
firebase deploy --only firestore:rules --project team-c-victory
```

Firestore 컬렉션을 콘솔에서 미리 만들 필요는 없습니다. 첫 연결에서 선수 31명의 새 프로필과 C조 8명의 특징 문서를 준비합니다. 기존 기록이 있으면 의미가 같은 항목만 이관하고 이미 있는 새 서버 값은 덮어쓰지 않습니다.

연결 실패 시 더 보기 메뉴와 선수 팝업의 오류 코드를 확인합니다. `permission-denied`는 규칙, `auth/operation-not-allowed`는 익명 인증, `unavailable`은 네트워크 연결을 먼저 확인합니다. 파일 직접 열기 대신 `npm start` 후 `http://localhost:8000` 또는 배포 주소에서 접속합니다.

## AI 연결

Functions 실제 배포에는 Firebase **Blaze 요금제**가 필요합니다. OpenAI API는 ChatGPT 개인 구독과 별도로 API 계정·결제를 설정합니다. [Firebase Functions 시작 안내](https://firebase.google.com/docs/functions/get-started), [OpenAI API 안내](https://developers.openai.com/api/reference/overview)

저장소 루트에서 서버 패키지를 설치합니다. 이 환경에서는 패키지 다운로드가 제한돼 설치·실제 배포를 수행하지 못했습니다.

```sh
npm --prefix functions install
firebase functions:secrets:set OPENAI_API_KEY --project team-c-victory
firebase deploy --only functions:analyzeMatchup --project team-c-victory
```

두 번째 명령의 비밀 입력창에 OpenAI API 키를 입력합니다. 키를 HTML·GitHub·채팅에 넣지 않습니다. Functions에 등록한 Secret Manager 값만 서버에서 읽습니다. Firebase 웹 앱 설정의 공개 `apiKey`와 OpenAI API 비밀 키는 별개입니다. [Firebase 비밀 값 설정](https://firebase.google.com/docs/functions/config-env)

기본값은 다음과 같습니다. 배포 시 파라미터 입력을 요구하면 기본값을 사용하면 됩니다.

| 설정 | 기본값 |
| --- | --- |
| Functions 리전 | `asia-northeast3` (서울) |
| 런타임 | Node.js 22 |
| `AI_MODEL` | `gpt-5.6-terra` |
| `AI_DAILY_LIMIT` | 한국 시간 기준 신규 분석 시도 50회/일 |
| 출력 제한 | 최대 2,000 토큰 |
| OpenAI 응답 제한 | 45초 |

설정을 바꾸려면 `functions/.env.team-c-victory`에 `AI_MODEL`·`AI_DAILY_LIMIT`만 적고 다시 배포합니다. 이 파일은 Git에서 제외됩니다. OpenAI 키는 계속 Secret Manager로 관리합니다. 모델 접근 권한과 지원 형식은 [모델 문서](https://developers.openai.com/api/docs/models/gpt-5.6-terra)를 확인하세요.

배포 전 훅이 `prepare-functions.cjs`를 실행해 공통 프로필 모델·공식 명단을 `functions/shared/`로 복사합니다. 생성 파일은 직접 수정하지 않습니다. 정적 빌드에는 서버 파일이 포함되지 않습니다. 최초 패키지 설치가 생성하는 `functions/package-lock.json`은 설치 버전을 고정하려면 함께 커밋합니다.

배포 후 **상대 페어 분석**에서 네 선수를 선택하고 **AI 분석**을 누릅니다. 같은 네 프로필·모델·프롬프트의 결과는 `matchupAnalyses`에서 공유합니다. 동시 요청은 한 번 생성하고 나머지는 완료를 구독합니다. 캐시 읽기는 일일 한도를 사용하지 않습니다. 실패한 호출과 재시도도 한도에 포함됩니다. 50회 제한은 호출 수 제한이며 요금의 절대 상한은 아닙니다.

## 데이터 확인

Firebase 콘솔 **Firestore Database → 데이터**에서 다음을 확인합니다.

| 컬렉션 | 내용 |
| --- | --- |
| `playerProfilesV2` | 새 C조 선호와 상대 관찰. 문서 ID는 `C:우디` 등 |
| `playerTraits` | C조 선수별 `items` 특징 목록 |
| `traitSuggestions` | C조 공용 특징 추천 |
| `keywordSuggestions` | 상대 키워드의 `kind`·`text` 공용 추천 |
| `teamLineups/C` | 확정표·`revision`·`profileVersion` |
| `matchupAnalyses` | 분석 `status`·`result`·`profileVersion`·`generatedAt` |
| `aiUsage` | 한국 날짜별 신규 분석 시도 `count`. 관리자만 읽음 |
| `playerProfiles` | 기존 프로필 백업. 새 입력은 여기에 쓰지 않음 |

익명 인증 사용자는 입력·확정을 할 수 있지만 문서 전체 삭제와 AI 결과 쓰기는 할 수 없습니다. 관리자 초기화는 별도 도구에서 실행합니다. 선수 입력마다 GitHub 커밋이나 재배포가 필요하지 않습니다.

## 테스트 선수 입력 초기화

사용자가 선택한 범위는 **선수 입력만 초기화, 공용 키워드 유지**입니다. 도구의 기본값도 이 범위입니다.

초기화 대상은 C조의 여섯 입력과 선수별 특징, 상대의 성향·관찰·기존 강점 참고, 이전 `playerProfiles` 기록입니다. 기본 명단·등급·배정표, `traitSuggestions`·`keywordSuggestions`, 팀 확정표, AI 캐시·일일 사용량은 유지합니다. 프로필이 바뀌면 이전 AI 결과는 현재 입력의 캐시로 사용되지 않습니다.

초기화 후에도 31개의 **빈 새 프로필**과 C조 8개의 빈 특징 문서는 남깁니다. DB를 빈 컬렉션으로 만들면 오래된 브라우저 저장값이 다시 이관될 수 있기 때문입니다. 새 페이지를 먼저 배포하고 모든 팀원이 페이지를 닫은 상태에서 실행한 뒤 새로고침하세요.

이 도구는 관리자 권한을 사용하는 로컬 작업입니다. Firebase CLI 로그인과 Admin SDK 인증은 별개입니다. [Google Cloud CLI 설치](https://cloud.google.com/sdk/docs/install) 후 프로젝트에 권한이 있는 계정으로 [Application Default Credentials](https://cloud.google.com/docs/authentication/provide-credentials-adc)를 설정합니다.

```sh
gcloud auth application-default login
gcloud auth application-default set-quota-project team-c-victory
npm --prefix functions install
```

먼저 대상 문서 수만 확인합니다. 이 실행은 데이터를 바꾸지 않습니다.

```sh
node reset-test-data.cjs --project team-c-victory --scope profiles
```

삭제 범위가 맞으면 다음 명령으로 초기화합니다.

```sh
node reset-test-data.cjs --project team-c-victory --scope profiles --execute
```

성공 메시지 후 사이트를 새로고침하고 빈 프로필과 유지된 공용 추천을 확인합니다. 이 작업 환경에는 관리자 연결이 없어 실제 DB 초기화는 아직 실행하지 않았습니다.

`--scope all`은 공용 추천·확정표·AI 캐시까지 정리하는 별도 범위이며 이번 요청에는 사용하지 않습니다. `aiUsage`는 어느 범위에서도 유지해 같은 날 추가 유료 호출이 가능해지지 않게 합니다.

## 실제 서비스 검증

두 기기 공유·확정표·AI 캐시·오류 처리는 [서비스 검증 순서](SERVICE_VERIFICATION.md)를 따라 확인합니다. 자동 검증은 `npm test`, 정적 배포 빌드는 `npm run build`입니다. Functions SDK 실행과 Firestore 규칙 컴파일·배포는 실제 Firebase 환경에서 별도로 확인해야 합니다.
