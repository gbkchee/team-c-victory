'use strict';
(function(root){
 // Coaching principles adapted to the selectable observations, not assessments of these players.
 const version='doubles-reference-v1',reviewedAt='2026-10-08';
 const sources={
  positioning:{title:'USHSTA · 복식 포지셔닝',url:'https://ushsta.org/doubles-positioning/'},
  lob:{title:'USHSTA · 로브 커버',url:'https://ushsta.org/covering-the-lob-in-doubles/'},
  threeShots:{title:'USHSTA · 서브·리턴 전개',url:'https://ushsta.org/doubles-as-easy-as-1-2-3/'},
  backhand:{title:'USTA · 백핸드와 경기 전략',url:'https://www.usta.com/en/home/improve/tips-and-instruction/national/learning-the-basics--backhand.html'},
  highBall:{title:'Tennis Ireland · 높은 백핸드',url:'https://www.tennisireland.ie/news/tennis-unlocked-high-balls-on-the-backend'},
  lefty:{title:'USTA · 왼손 서브 리턴',url:'https://www.usta.com/en/home/improve/tips-and-instruction/national/improve-your-tennis-game--returning-a-lefty-serve.html'},
  wideSlice:{title:'Greg Moran · 복식 와이드 슬라이스 서브',url:'https://www.tennis.com/baseline/articles/break-the-rules-5-the-wide-slice-serve-in-doubles'},
  returnServe:{title:'HEAD · 서브 리턴',url:'https://www.head.com/en_US/rs/stories/how-to-return-serve-in-tennis'},
  baseline:{title:'Tennis Ireland · 베이스라인 위치',url:'https://www.tennisireland.ie/news/tennis-unlocked-baseline-positioning'},
  communication:{title:'USTA · 복식 파트너와 소통',url:'https://www.usta.com/en/home/stay-current/texas/ask-a-coach-brandi-bratek.html'}
 };
 const rules=[
  {id:'net',kind:'pattern',terms:['서브 후 네트 접근','네트 접근','네트에 자주 붙음'],title:'네트 접근에 대응',caution:'뜨는 리턴은 상대 전위가 공격하기 쉬워요.',response:'낮은 크로스 리턴을 우선하고, 둘 다 네트에 붙으면 깊은 로브를 섞어보세요.',sourceIds:['positioning']},
  {id:'poach',kind:'pattern',terms:['적극적인 포칭','포칭','포칭 자주 함'],title:'포칭에 대응',caution:'크로스 코스만 반복하면 움직이는 전위에게 잡힐 수 있어요.',response:'낮은 크로스를 기본으로, 전위가 움직여 라인을 비울 때만 라인 리턴을 섞어보세요.',sourceIds:['positioning']},
  {id:'cross',kind:'pattern',terms:['크로스 랠리 위주'],title:'크로스 랠리에 대응',caution:'얕은 공은 상대의 네트 진입 기회가 될 수 있어요.',response:'깊은 크로스로 연결하고, 상대가 짧게 주는 공에서 앞으로 전개해보세요.',sourceIds:['threeShots']},
  {id:'line',kind:'pattern',terms:['다운더라인 공격','다운더라인','직선 공격'],title:'라인 공격에 대응',caution:'전위가 너무 일찍 중앙으로 움직이면 라인이 열려요.',response:'라인 쪽 공간을 남겨두지 말고, 둘이 공 쪽으로 함께 위치를 조정하세요.',sourceIds:['positioning']},
  {id:'lob',kind:'pattern',terms:['로브 자주 사용','로브 잘 함'],title:'로브에 대응',caution:'전위가 무리하게 뒷걸음질하면 다음 공 대응이 어려워져요.',response:'앞에서 잡을 짧은 로브는 전위가, 머리를 넘는 깊은 로브는 파트너가 맡고 콜하며 자리를 바꾸세요.',sourceIds:['lob']},
  {id:'slice',kind:'pattern',terms:['슬라이스로 낮게 연결'],title:'낮은 슬라이스에 대응',caution:'낮은 타점에서 한 번에 끝내려 하면 실수가 늘 수 있어요.',response:'낮은 공은 여유 있는 높이로 연결하고, 짧거나 뜨는 공에서 공격으로 전환하세요.',sourceIds:['positioning','backhand']},
  {id:'body',kind:'weak',terms:['몸쪽 공'],title:'몸쪽 공 상황',response:'강도보다 코스를 조절해 몸쪽 서브·리턴을 시도하고 다음 공을 준비하세요.',tactic:'몸쪽 공에 대응이 늦는 반응이 반복될 때 같은 코스를 활용해보세요.',sourceIds:['threeShots']},
  {id:'high-backhand',kind:'weak',terms:['높은 백핸드'],title:'높은 백핸드 상황',response:'높고 깊은 백핸드 쪽 공을 무리 없는 범위에서 보내보세요.',tactic:'상대가 뒤로 물러나거나 포핸드로 돌아서는 경우 빈 공간을 활용해보세요.',sourceIds:['highBall','backhand']},
  {id:'low-volley',kind:'weak',terms:['낮은 발리','발리'],title:'낮은 발리 상황',response:'상대가 네트에 있을 때 발밑으로 낮게 연결해보세요.',tactic:'낮은 발리 뒤 공이 뜨거나 짧아지면 다음 공을 공격해보세요.',sourceIds:['positioning']},
  {id:'return',kind:'weak',terms:['빠른 서브 리턴','리턴'],title:'리턴 상황',response:'서브 성공률을 유지하며 중앙·몸쪽 등 코스를 바꿔보세요.',tactic:'같은 코스에서 짧은 리턴이 반복되면 서브 다음 공까지 준비하세요.',sourceIds:['threeShots']},
  {id:'lob-weak',kind:'weak',terms:['로브 대처','로브'],title:'로브 대처 상황',response:'상대가 네트에 붙었을 때 넘길 수 있는 깊은 로브를 사용해보세요.',tactic:'로브 뒤 두 선수의 위치가 벌어질 때 열린 공간을 활용해보세요.',sourceIds:['positioning','lob']},
  {id:'short-ball',kind:'weak',terms:['짧은 공 처리'],title:'짧은 공 처리 상황',response:'상대가 뒤에 있을 때 낮고 짧은 공으로 앞으로 움직이게 해보세요.',tactic:'짧은 공이 높게 뜨면 역공당할 수 있어요. 접근 뒤 빈 공간이 생길 때 활용하세요.',sourceIds:['threeShots']},
  {id:'forehand',kind:'weak',terms:['포핸드','포핸드 스트록'],title:'포핸드 방향',response:'안정적으로 보낼 수 있는 포핸드 쪽 코스를 사용해보세요.',tactic:'그 방향에서 짧은 공이 반복되면 다음 공으로 연결하세요. 기록만으로 약점을 확정하지 않아요.',sourceIds:['backhand']},
  {id:'backhand',kind:'weak',terms:['백핸드'],title:'백핸드 방향',response:'안정적으로 보낼 수 있는 백핸드 쪽 코스를 사용해보세요.',tactic:'그 방향에서 짧은 공이 반복되면 다음 공으로 연결하세요. 기록만으로 약점을 확정하지 않아요.',sourceIds:['backhand']},
  {id:'left-handed',kind:'note',terms:['왼손잡이'],title:'왼손 서브 방향',caution:'왼손잡이라는 기록만으로 서브 구질이나 약점을 정하지 않아요.',response:'왼손 슬라이스가 실제로 리턴하는 사람의 왼쪽으로 휘면 서는 위치를 조금 조정하세요. 라인 리턴은 상대 전위 위치까지 보고 선택하세요.',sourceIds:['lefty','positioning']},
  {id:'height',kind:'note',terms:['키가 큼','장신'],title:'높이보다 로브의 깊이',caution:'키가 크다는 기록만으로 스매시가 강하거나 낮은 공에 약하다고 단정하지 않아요.',response:'로브는 키만 보고 결정하지 말고 실제 전위 위치와 도달 범위를 고려해 충분히 깊게 보내세요. 짧은 로브는 공격받기 쉬워요.',sourceIds:['positioning','lob']},
  {id:'slice-serve',kind:'note',terms:['슬라이스 서브'],title:'슬라이스 서브에 대응',caution:'와이드로 끌려갈 때 무리하게 강한 리턴을 만들면 코트가 더 열릴 수 있어요.',response:'실제 휘는 방향에 맞춰 좌우 위치를 조정하고 크로스로 연결하세요. 다음 공에 대비해 파트너와 열린 공간을 커버하세요.',sourceIds:['wideSlice','returnServe','positioning']},
  {id:'topspin',kind:'note',terms:['탑스핀','톱스핀'],title:'높게 튀는 공에 대응',caution:'탑스핀 기록만으로 공이 항상 높게 튀거나 강하다고 보지 않아요.',response:'실제로 높이 튀는 공은 뒤로 조정해 편한 높이에서 치거나, 익숙하다면 앞으로 들어가 일찍 받으세요. 깊게 밀렸으면 회복할 시간을 만드세요.',sourceIds:['highBall','baseline']},
  {id:'deep-ball',kind:'note',terms:['베이스라인 긴 공','배이스라인 긴 공'],title:'깊은 공에 대응',caution:'계속 뒤로 밀리면 짧은 공과 각도 있는 공을 커버하기 어려워져요.',response:'깊은 공에는 필요한 만큼 위치를 조정해 연결한 뒤 회복하세요. 상대도 뒤에 남으면 깊은 크로스로 전개하고 짧은 공에서 앞으로 들어가세요.',sourceIds:['baseline','positioning']},
  {id:'kick-serve',kind:'note',terms:['킥서브','킥 서브'],title:'높이 튀는 서브에 대응',caution:'서브가 실제로 높게 튀면 서 있는 위치에서 불편한 높이까지 기다리지 마세요.',response:'편한 타점을 만들도록 앞뒤 위치를 조절하고 짧은 준비 동작으로 리턴하세요. 상대가 서브 뒤 네트로 들어오면 낮은 크로스로 연결하세요.',sourceIds:['returnServe','highBall','positioning']},
  {id:'two-back',kind:'pattern',terms:['둘 다 베이스라인','두 명 다 뒤에 있음'],title:'둘 다 뒤에 있을 때',caution:'둘 다 뒤에 있어도 패싱과 로브가 좋을 수 있어요. 기록만으로 네트를 비웠다고 무조건 전진하지 마세요.',response:'깊이와 코스로 짧은 공을 만든 뒤 네트로 전개하세요. 약한 접근 공 뒤에는 전진을 서두르지 마세요.',tactic:'상대가 짧게 돌려주고 둘 다 뒤에 남을 때 앞에서 열린 각도를 활용해보세요.',sourceIds:['positioning','threeShots']},
  {id:'middle',kind:'pattern',terms:['중앙으로 자주 공격','센터 공략'],title:'중앙 공에 대응',caution:'가운데 공에서 서로 기다리면 처리할 타이밍을 놓칠 수 있어요.',response:'가운데 공과 로브를 누가 맡을지 경기 전에 정하고 콜하세요. 서브·리턴 코스도 짧게 공유해 다음 위치를 맞추세요.',sourceIds:['communication','lob']},
  {id:'fast-serve',kind:'pattern',terms:['빠른 서브','강한 서브'],title:'빠른 서브에 대응',caution:'리턴마다 강하게 맞받으려 하면 준비 시간이 부족해질 수 있어요.',response:'조금 뒤에서 반응 시간을 확보하고 준비 동작을 짧게 해 연결하세요. 서브 속도를 활용해 코스를 조절하고, 상대가 전진하면 낮은 크로스를 우선하세요.',sourceIds:['returnServe','positioning']},
  {id:'second-serve',kind:'pattern',terms:['두 번째 서브 뒤에 남음','세컨드 서브 후 베이스라인'],title:'뒤에 남는 세컨드 서브에 대응',response:'편하게 받을 수 있을 때만 리턴 위치를 조금 앞당기세요. 서버가 뒤에 남으면 깊은 크로스 리턴으로 묶고 다음 짧은 공을 준비하세요.',tactic:'리턴 뒤 상대 공이 짧아질 때 네트로 전개해보세요.',sourceIds:['returnServe','positioning','threeShots']}
 ];
 const normalize=text=>text.normalize('NFC').replace(/\s/g,'');
 function match(kind,text){
  // Exact known terms avoid treating free text such as '로브 안 씀' as a positive observation.
  const target=normalize(text),actualKind=kind==='note'&&['로브잘함','네트에자주붙음'].includes(target)?'pattern':kind;
  return rules.find(rule=>rule.kind===actualKind&&rule.terms.some(term=>normalize(term)===target))||null;
 }
 const general={title:'깊이와 코스로 전개',action:'상대가 뒤에 있으면 깊은 크로스, 네트에 붙으면 낮은 공이나 깊은 로브를 선택하세요.',basis:'일반 복식 원칙 · 상대의 강점·약점은 아직 확인되지 않았습니다.',sourceIds:['positioning','threeShots']};
 const data={version,reviewedAt,sources,rules,match,general};
 if(typeof module==='object'&&module.exports)module.exports=data;else root.OPPONENT_TACTICS=data;
})(typeof window==='undefined'?globalThis:window);
