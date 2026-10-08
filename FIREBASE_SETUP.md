# Firebase 연결·무료 Gemini·선수 입력 초기화

프로젝트는 `team-c-victory`입니다. GitHub Pages가 화면을 배포하고 Firebase 익명 인증·Cloud Firestore가 입력을 공유합니다. 상대 공략은 키 없이 기본 규칙으로 표시하며, 추가 설정 후 Firebase AI Logic의 Gemini Developer API도 사용할 수 있습니다.

## 선수 입력과 추천 연결

1. Firebase 콘솔 **Authentication → 로그인 방법 → 익명**을 사용 설정합니다.
2. **Firestore Database → 규칙**에 이 저장소의 최신 `firestore.rules` 전체 내용을 게시합니다. 새 Gemini 캐시와 사용량 규칙도 포함합니다.
3. `main`을 원격에 푸시하고 GitHub Actions의 Pages 배포 성공을 확인합니다.
4. 페이지 더 보기 메뉴에 **팀원과 실시간으로 공유 중입니다.**가 표시되는지 확인합니다.

Firebase CLI를 사용하는 경우 저장소 루트에서 실행합니다. Node.js 22 이상이 필요합니다.

```sh
npm install -g firebase-tools
firebase login
firebase deploy --only firestore:rules --project team-c-victory
```

컬렉션은 미리 만들지 않아도 됩니다. 첫 연결에서 선수 31명의 새 프로필과 C조 8명의 특징 문서를 준비합니다. 기존 기록은 의미가 같은 항목만 이관하며 이미 있는 새 서버 값은 덮어쓰지 않습니다.

연결 실패 시 더 보기 메뉴와 선수 팝업의 오류 코드를 확인합니다. `permission-denied`는 규칙, `auth/operation-not-allowed`는 익명 인증, `unavailable`은 네트워크를 먼저 확인합니다. 파일을 직접 열기보다 `npm start` 후 `http://localhost:8000` 또는 배포 주소로 접속합니다.

## 무료 Gemini 연결

**Cloud Billing 계정이 연결되지 않은 Spark 요금제를 유지합니다.** Firebase AI Logic은 무료이고 Gemini Developer API는 Spark에서 무료 할당량을 제공합니다. Cloud Billing을 연결하면 Blaze로 바뀌며 Gemini Developer API 사용에도 종량 요금이 적용됩니다. 앱 코드가 프로젝트의 요금제 변경을 막아 주지는 않습니다. [공식 가격 안내](https://firebase.google.com/docs/ai-logic/pricing?api=dev)

1. Firebase 콘솔 **AI Services → AI Logic → 시작하기**를 엽니다.
2. 공급자로 **Gemini Developer API**를 선택하고 안내에 따라 사용 설정합니다. Vertex AI 설정과 Functions 배포는 필요하지 않습니다.
3. 같은 웹 앱에 Firebase **App Check → reCAPTCHA Enterprise**를 등록합니다. 새 AI Logic 설정은 2026년 7월부터 App Check를 자동으로 강제합니다. [시작 안내](https://firebase.google.com/docs/ai-logic/get-started?platform=web)
4. reCAPTCHA Enterprise에서 웹사이트용 **점수 기반 키**를 만들고 허용 도메인에 `gbkchee.github.io`를 등록합니다. 도메인에는 경로를 넣지 않습니다. Firebase App Check에 해당 **공개 사이트 키**를 등록합니다. [웹 App Check 설정](https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider)
5. 저장소의 `gemini-config.js`에 공개 사이트 키를 넣습니다. `appCheckSiteKey:''`의 빈 값만 변경하면 됩니다.
6. 변경 사항을 커밋·푸시하고 **상대 페어 분석 → Gemini AI 분석**으로 확인합니다.

Gemini API 비밀 키를 HTML·JavaScript·채팅에 넣지 않습니다. Firebase AI Logic의 설정 과정이 사용하는 Gemini 키는 Firebase 프록시가 관리합니다. App Check 공개 사이트 키는 별개이며 웹 앱에 포함할 수 있습니다.

회사 보안 정책으로 키 생성이나 Google Cloud 설정이 막히면 해당 설정을 보류합니다. 현재 `appCheckSiteKey`는 비어 있어 Gemini 버튼이 비활성화됩니다. 선수 입력·공유·페어 추천·관찰 기반 기본 공략은 계속 동작합니다. 현재 작업에서는 키 생성·콘솔 설정·실제 Gemini 호출을 수행하지 않았습니다.

| 앱 설정 | 값 |
| --- | --- |
| 공급자 | Firebase AI Logic · Gemini Developer API |
| 모델 | `gemini-3.5-flash-lite` |
| 신규 분석 시도 | 팀 전체 한국 시간 기준 50회/일 |
| 출력 제한 | 최대 2,000 토큰 |
| 앱 확인 준비·생성 제한 | 각각 45초 |
| 공동 생성 예약 | 90초 |

선택 모델은 Developer API의 무료 사용을 지원합니다. 모델 제공 여부와 프로젝트별 무료 할당량은 [지원 모델](https://firebase.google.com/docs/ai-logic/models)과 콘솔에서 확인합니다. Gemini 무료 한도에 먼저 도달하면 신규 분석은 재시도를 안내합니다. 저장된 캐시와 기본 공략은 사용할 수 있습니다. 같은 분석은 캐시를 재사용하며 실패·재시도도 앱의 50회 한도에 포함됩니다. 이 수치는 앱의 요청 경로에 적용되며 Gemini API 전체 호출량을 강제하는 보안 상한은 아닙니다.

무료 Gemini에는 Google의 무료 서비스 데이터 이용 조건이 적용됩니다. 분석에 전송한 선호·관찰과 응답이 Google 제품 개선에 사용될 수 있습니다. [Gemini API 이용약관](https://ai.google.dev/gemini-api/terms)

로컬에서 Gemini까지 시험할 경우 운영 reCAPTCHA 키의 허용 도메인에 localhost를 추가하지 않습니다. 브라우저 개발자 도구에서 아래 설정 후 새로고침하고 AI 버튼을 누르면 App Check 디버그 토큰이 콘솔에 나타납니다. Firebase **App Check → 디버그 토큰 관리**에 등록한 뒤 사용합니다. 코드에는 localhost에서만 활성화되는 조건이 있습니다. 디버그 토큰은 Git이나 운영 페이지에 넣지 않습니다. [공식 디버그 안내](https://firebase.google.com/docs/app-check/web/debug-provider)

```js
localStorage.setItem('teamc.appcheck-debug', 'true');
location.reload();
```

작업 후 `localStorage.removeItem('teamc.appcheck-debug')`로 제거합니다. 입력과 기본 공략만 시험할 때는 이 설정이 필요하지 않습니다.

## 데이터 확인

Firebase 콘솔 **Firestore Database → 데이터**에서 확인합니다.

| 컬렉션·문서 | 내용 |
| --- | --- |
| `playerProfilesV2` | 새 선호와 상대 관찰. ID는 `C:우디` 등 |
| `playerTraits` | C조 선수별 `items` 특징 |
| `traitSuggestions` | C조 공용 특징 추천 |
| `keywordSuggestions` | 상대 관찰의 `kind`·`text` 공용 추천 |
| `teamLineups/C` | 확정표·`revision`·`profileVersion` |
| `geminiMatchupAnalyses` | `status`·`result`·`profileVersion`·요청 소유자 |
| `geminiAiUsage/team` | `dayStart`·`count`·마지막 예약 정보 |
| `playerProfiles` | 기존 프로필 백업 |

기존 OpenAI용 `matchupAnalyses`·`aiUsage`는 유지하지만 새 분석에서는 사용하지 않습니다. 익명 팀원은 선수 입력·확정·Gemini 분석 예약을 할 수 있습니다. 예약한 사용자만 유효기간 안에 결과를 기록할 수 있고 완료된 분석은 수정·삭제할 수 없습니다. 이 캐시는 팀원 브라우저가 작성하며 서버가 모델 응답의 출처를 증명하지는 않습니다.

선수 입력에는 GitHub 커밋이나 재배포가 필요하지 않습니다. 공유 데이터 변경은 Firestore에 바로 저장됩니다.

## 테스트 선수 입력 초기화

선택한 범위는 **선수 입력만 초기화, 공용 키워드 유지**입니다. 도구의 기본값도 이 범위입니다.

C조 선호와 선수별 특징, 상대 성향·관찰·기존 강점 참고, 이전 `playerProfiles`를 초기화합니다. 기본 명단·등급·배정표·공용 추천·팀 확정표·기존 및 Gemini 캐시·일일 사용량은 보존합니다. 프로필 버전이 바뀌면 이전 분석을 현재 입력의 캐시로 사용하지 않습니다.

초기화 후 31개의 빈 새 프로필과 C조 8개의 빈 특징 문서를 남깁니다. 오래된 브라우저 입력이 다시 이관되는 것을 막기 위한 처리입니다. 새 페이지를 먼저 배포하고 모든 팀원이 페이지를 닫은 상태에서 실행한 뒤 새로고침합니다.

이 도구는 관리자 권한으로 실행하는 로컬 작업이며 AI 연결에 필요하지 않습니다. Firebase CLI 로그인과 Admin SDK 인증은 별개입니다. 프로젝트 권한이 있는 계정으로 [Application Default Credentials](https://cloud.google.com/docs/authentication/provide-credentials-adc)를 설정합니다. 아래 방법은 서비스 계정 키 파일을 생성하지 않습니다.

```sh
gcloud auth application-default login
gcloud auth application-default set-quota-project team-c-victory
npm --prefix admin-tools install
```

먼저 대상만 확인합니다. 이 명령은 데이터를 바꾸지 않습니다.

```sh
node reset-test-data.cjs --project team-c-victory --scope profiles
```

확인 후 초기화합니다.

```sh
node reset-test-data.cjs --project team-c-victory --scope profiles --execute
```

이 환경에는 관리자 연결이 없어 실제 DB 초기화는 실행하지 않았습니다. `--scope all`은 공용 추천·확정표·기존 및 Gemini 캐시도 정리하는 별도 범위로 이번 요청에는 사용하지 않습니다. 두 사용량 컬렉션은 어느 범위에서도 유지합니다.

자동 검증은 `npm test`, 정적 빌드는 `npm run build`입니다. 실제 Firestore 규칙·App Check·Gemini 연결은 [서비스 검증 순서](SERVICE_VERIFICATION.md)를 따릅니다.
