# 상대 페어 분석의 복식 참고 자료

2026-10-08 조사·적용. 일반 코칭 자료를 짧게 재작성해 `tactics-data.js`에 저장합니다. 선택한 기록에 맞춰 브라우저에서 계산하므로 검색·AI 호출·새 DB 컬렉션 없이 동작합니다. 자료 변경은 코드 배포로 공유하며 선수 관찰은 기존 Firestore에 저장합니다.

## 조사한 자료 10개

| 자료 | 활용하는 원칙 |
| --- | --- |
| [USHSTA · Doubles Positioning](https://ushsta.org/doubles-positioning/) | 전진하는 서버에는 낮은 크로스, 뒤에 남는 서버에는 깊은 크로스. 전위 위치에 따라 라인·로브 선택. 약한 접근 공 뒤 전진을 서두르지 않기 |
| [USHSTA · Covering the Lob in Doubles](https://ushsta.org/covering-the-lob-in-doubles/) | 앞으로 잡을 로브와 파트너가 커버할 깊은 로브를 구분하고 공간 회복 |
| [USHSTA · Doubles as Easy as 1, 2, 3](https://ushsta.org/doubles-as-easy-as-1-2-3/) | 서브·리턴 → 깊은 연결 → 네트 마무리. 몸쪽·중앙 서브로 다음 공 준비 |
| [USTA · Learning the Basics: Backhand](https://www.usta.com/en/home/improve/tips-and-instruction/national/learning-the-basics--backhand.html) | 본인이 안정적으로 치는 샷으로 상대가 어려워하는 방향에 전개 |
| [Tennis Ireland · High Balls on the Backhand](https://www.tennisireland.ie/news/tennis-unlocked-high-balls-on-the-backend) | 높은 공은 뒤로 조절해 낮춰 받기, 앞으로 들어가 일찍 받기, 슬라이스·포핸드 우회 등 선택지 |
| [USTA · Returning a Lefty Serve](https://www.usta.com/en/home/improve/tips-and-instruction/national/improve-your-tennis-game--returning-a-lefty-serve.html) | 실제 왼손 슬라이스 방향에 맞춰 리턴 위치 조절. 앱의 라인 선택은 복식 전위 위치도 함께 고려 |
| [Greg Moran · The Wide Slice Serve in Doubles](https://www.tennis.com/baseline/articles/break-the-rules-5-the-wide-slice-serve-in-doubles) | 와이드 서브가 열어주는 코스와 전위의 위치. 기사에 제시된 특정 서브 비율은 앱에 강제하지 않음 |
| [HEAD · How to Return Serve in Tennis](https://www.head.com/en_US/rs/stories/how-to-return-serve-in-tennis) | 속도·회전에 따라 앞뒤·좌우 리턴 위치 조절, 짧은 준비 동작, 연결 우선 |
| [Tennis Ireland · Baseline Positioning](https://www.tennisireland.ie/news/tennis-unlocked-baseline-positioning) | 필요 이상으로 뒤에 머물 때 각도·짧은 공 커버가 어려워짐. 공에 따라 위치 조절·회복 |
| [USTA · Competing with a New Doubles Partner](https://www.usta.com/en/home/stay-current/texas/ask-a-coach-brandi-bratek.html) | 경기 전 선호와 역할 공유, 서브·리턴 코스와 포칭 계획 소통, 실수 뒤 응원 |

이는 경기 결과나 선수 능력을 검증한 자료가 아닙니다. 높은 백핸드 뒤 열린 공간 활용, 슬라이스 서브를 받은 뒤 공간 커버 등은 자료의 원칙을 입력 상황에 적용한 제안입니다. 특정 선수의 약점이나 성공 확률을 증명한다는 뜻은 아닙니다.

## 입력과 연결

| 종류 | 미리 정한 입력 | 추가로 연결하는 알려진 문구 |
| --- | --- | --- |
| 공격 패턴 | 서브 후 네트 접근, 적극적인 포칭, 크로스 랠리 위주, 다운더라인 공격, 로브 자주 사용, 슬라이스로 낮게 연결 | 둘 다 베이스라인, 중앙으로 자주 공격, 빠른 서브, 두 번째 서브 뒤에 남음 등 |
| 어려워하는 상황 | 몸쪽 공, 높은 백핸드, 낮은 발리, 빠른 서브 리턴, 로브 대처, 짧은 공 처리, 포핸드, 백핸드 | 발리, 리턴, 로브 등 기존 기록의 명시적인 별칭 |
| 특징 | 왼손잡이, 키가 큼, 슬라이스 서브, 로브 잘 함, 탑스핀, 베이스라인 긴 공 | 장신, 킥서브, 네트에 자주 붙음 등 |

현재 24개 규칙입니다. 로브 잘 함·네트에 자주 붙음은 같은 구질의 기존 패턴 규칙에 연결합니다. 선수 입력 항목을 더 늘리지는 않습니다. 자유 메모는 계속 저장할 수 있지만 알려지지 않은 문구에는 특정 전술을 자동 부여하지 않습니다. 공백·한글 정규화를 제외하면 명시한 문구가 일치할 때만 연결하므로 '로브 안 씀'을 로브 패턴으로 잘못 읽지 않습니다.

같은 관찰은 합치면서 선수 이름과 입력 문구를 모두 보존합니다. 대응방안은 어려워하는 상황 → 공격 패턴 → 특징 순으로 우선하며 화면의 각 영역은 최대 5개입니다. 기록이 비어 있으면 일반 복식 원칙을 제공합니다. 키가 큼·왼손잡이 등의 특징만으로 공략할 약점을 생성하지 않습니다.

새 자료를 보강할 때에는 본문을 확인한 출처를 `sources`에 추가하고 대응 조건·문구·출처 ID를 `rules`에 기록합니다. 자료 내용이 바뀌면 `version`도 올려 선택적 Gemini 캐시가 이전 자료를 재사용하지 않게 합니다. `npm test`는 기본 입력 전체의 연결, 출처 ID, 부정 표현·자유 메모의 처리, 선수 근거 병합을 검증합니다.
