# 상대 페어 분석 보강 자료 검토

이번 문서는 자료 조사와 적용안입니다. 아래 자료나 일반 패턴을 분석 코드에 추가하지는 않았습니다.

## 현재 코드에서 확인한 점

- `tactics-data.js`에는 10개 출처와 24개 관찰 대응 규칙이 있습니다.
- `gemini-analysis.js`는 관찰 키워드에 대응하는 참고 팁을 AI 입력에 넣습니다. 대응하는 키워드가 없으면 일반 팁 하나를 사용합니다.
- 일반적인 복식 전개를 늘리려면, 관찰 대응 팁에 더해 기본 패턴을 별도 맥락으로 전달하고 결과에도 관찰 사실과 구분해 표시하는 편이 좋습니다.

## 추가할 만한 공식 자료

1. [LTA · Essential doubles tactics & hand signals](https://www.lta.org.uk/play/tennis-tips-and-techniques/essential-doubles-tactics-and-hand-signals/)
   - 공격·중립·수비 상태에 따른 전위 위치, 파트너와 좌우 공간을 함께 메우는 움직임.
   - 포인트 전에 서브 방향과 전위의 이동 여부를 합의하는 방법.
2. [LTA · Louis Cayer의 복식 Q&A](https://www.lta.org.uk/advantage-home/content/how-to-improve-your-doubles-skills-your-questions-answered-by-expert-lta-coach-louis-cayer/)
   - 반응형·예측형·사전 약속형 포칭의 구분.
   - 상대가 어려운 공을 처리할 때 중앙을 좁히는 판단과, 포인트 사이 짧은 소통 루틴.
3. [LTA · Four easy fixes to help you win more doubles matches](https://www.lta.org.uk/advantage-home/content/four-easy-fixes-to-help-you-win-more-doubles-matches/)
   - 크로스 리턴, 중앙 커버, 짧은 공 이후 전진.
   - 두 명이 전진할 때 나란히 붙기보다 로브까지 고려해 깊이에 차이를 두는 배치.
4. [USHSTA · Doubles as Easy as 1, 2, 3](https://ushsta.org/doubles-as-easy-as-1-2-3/)
   - 기존 참고 자료이지만, 서브/리턴 → 상대를 뒤에 묶는 깊은 공 → 마무리 발리의 순서로 더 구체화할 수 있습니다.
5. [USHSTA · Doubles Positioning](https://ushsta.org/doubles-positioning/)
   - 기존 참고 자료. 서버가 뒤에 남으면 깊은 크로스, 서브 뒤 전진하면 낮은 크로스·라인·로브 등 상황에 따른 선택의 근거로 활용할 수 있습니다.

## 제안하는 기본 패턴 6개

| 상황 | 일반적인 선택과 다음 행동 | 출처 |
| --- | --- | --- |
| 상대 서버가 뒤에 남음 | 깊은 크로스로 뒤에 묶고, 짧은 공이 오면 전진해 다음 발리 준비 | USHSTA 1·2·3, Positioning |
| 상대가 서브 뒤 전진 | 낮은 크로스로 첫 발리 타점을 낮추는 선택. 전위 위치에 따라 라인이나 깊은 로브도 검토 | USHSTA Positioning |
| 전위의 포칭에 자주 걸림 | 같은 리턴을 반복하지 않고 전위가 출발하는 시점과 열린 코스를 확인 | LTA Louis Cayer, USHSTA Positioning |
| 상대를 바깥으로 벌림 | 파트너와 함께 이동해 중앙을 메우고 다음 공을 준비 | LTA Essential tactics |
| 공격할 수 있는 짧은 공 | 안정적으로 전진하되 두 사람의 깊이에 차이를 두어 로브 커버까지 준비 | LTA Four fixes |
| 서브 전 전개가 불분명함 | 서브 방향과 전위 이동 여부를 먼저 약속해 다음 커버 위치를 맞춤 | LTA Essential tactics, Louis Cayer |

이는 선수별 약점에 대한 판단이 아니라 코칭 자료의 일반 원칙을 앱 상황에 맞게 정리한 적용안입니다. 선수에게 관찰된 사실, 실제로 시험할 조건, 다음 행동을 구분하는 것이 중요합니다.

## 화면과 AI 입력에 반영할 경우

- 결과를 ‘상대 기록에서 확인된 점’과 ‘일반 복식 패턴’으로 구분합니다.
- 패턴은 ‘상황 → 선택 → 다음 공’ 형태로 2~3개만 보여줍니다.
- 기록이 없는 능력이나 페어 호흡은 추정하지 않고, 일반 원칙은 일반 원칙이라고 명시합니다.
- 참고 자료 버전을 변경해 이전 분석 캐시와 구분합니다.
