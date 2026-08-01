/**
 * 퍼널 정의. 단계 순서와 "이 숫자가 무엇을 뜻하는가"를 한 곳에 모아두고
 * 매니저 페이지는 이 정의를 그대로 받아 렌더링한다.
 * 퍼널을 추가/수정하려면 이 파일만 고치면 된다.
 *
 * 전환율은 "앞 단계를 모두 거친 방문자" 기준으로 계산한다(순서를 지킨 퍼널).
 * 예를 들어 랜딩을 보지 않고 생성 페이지로 바로 들어온 사람은 생성 퍼널에 잡히지 않는다.
 */

const EVENTS = {
  LANDING_VIEW: "landing_view",
  CREATE_CTA_CLICK: "create_cta_click",
  CREATE_VIEW: "create_view",
  CREATE_SUBMIT: "create_submit",
  CREATE_SUCCESS: "create_success",
  INVITE_SHARE: "invite_share",

  TABLE_VIEW: "table_view",
  JOIN_SUBMIT: "join_submit",
  JOIN_SUCCESS: "join_success",
  SCHEDULE_SAVE: "schedule_save",
  RANKING_OPEN: "ranking_open",
};

const EVENT_NAMES = Object.values(EVENTS);

const FUNNELS = [
  {
    key: "creation",
    title: "생성 퍼널",
    unit: "명",
    question: "서비스를 발견한 사람이 테이블을 만들고 공유까지 이어지는가?",
    meaning:
      "신규 유입이 실제 '모임 주최자'로 바뀌는 과정입니다. 마지막 공유 단계까지 가야 비로소 테이블이 살아나기 때문에, 생성 성공이 아니라 링크 공유를 최종 목표로 봅니다.",
    steps: [
      {
        event: EVENTS.LANDING_VIEW,
        label: "랜딩 방문",
        meaning: "메인 페이지에 도착한 사람. 유입의 크기 자체를 나타냅니다.",
        drop: "이 숫자가 작으면 전환 문제가 아니라 유입 문제입니다. SEO·블로그·공유 링크 노출을 먼저 늘려야 합니다.",
      },
      {
        event: EVENTS.CREATE_CTA_CLICK,
        label: "생성 버튼 클릭",
        meaning: "'로그인 없이 생성하기'를 누른 순간. 랜딩 카피와 첫인상이 설득에 성공했는지를 보여줍니다.",
        drop: "여기서 많이 빠지면 랜딩 메시지가 가치를 전달하지 못한 것입니다. 헤드라인·CTA 위치·서비스 미리보기를 손볼 지점입니다.",
      },
      {
        event: EVENTS.CREATE_VIEW,
        label: "생성 페이지 진입",
        meaning: "실제 생성 폼에 도달. 정상이라면 앞 단계와 거의 같아야 합니다.",
        drop: "클릭 대비 손실이 크면 라우팅 오류나 초기 로딩 지연을 의심해야 합니다.",
      },
      {
        event: EVENTS.CREATE_SUBMIT,
        label: "생성 시도",
        meaning: "날짜·시간·모임 이름을 채우고 '생성하기'를 누름. 폼 작성 난이도가 그대로 드러납니다.",
        drop: "가장 흔한 이탈 구간입니다. 입력 단계가 길거나 달력 조작이 어렵다는 신호이니 필수 입력을 줄이는 것을 검토하세요.",
      },
      {
        event: EVENTS.CREATE_SUCCESS,
        label: "생성 성공",
        meaning: "서버에 테이블이 실제로 저장됨.",
        drop: "시도 대비 손실은 곧 에러율입니다. 유효성 검증 실패나 생성 요청 제한(rate limit)에 걸린 사용자가 있는지 확인하세요.",
      },
      {
        event: EVENTS.INVITE_SHARE,
        label: "링크 공유",
        meaning:
          "초대 링크를 복사한 순간. 만들기만 하고 공유하지 않은 테이블은 아무도 참여하지 않는 죽은 테이블이므로, 이 단계가 진짜 활성화 지표입니다.",
        drop: "생성은 했는데 공유가 없다면 생성 직후 공유 안내가 약한 것입니다. 완료 화면에서 복사 버튼을 더 크게 노출하거나 카카오톡 공유를 붙일 지점입니다.",
      },
    ],
  },
  {
    key: "participation",
    title: "참여 퍼널",
    unit: "명",
    question: "초대받아 들어온 사람이 자기 일정을 실제로 입력하는가?",
    meaning:
      "이 서비스의 핵심 전환입니다. 참여자가 일정을 저장해야 골든타임이 계산되기 때문에, 테이블 방문에서 일정 저장까지의 전환율이 사실상 제품의 성적표입니다.",
    steps: [
      {
        event: EVENTS.TABLE_VIEW,
        label: "테이블 방문",
        meaning: "초대 링크를 타고 테이블에 들어온 사람. 주최자의 재방문도 포함됩니다.",
        drop: "이 숫자가 생성 대비 너무 작다면 링크가 실제로 공유되지 않고 있다는 뜻입니다.",
      },
      {
        event: EVENTS.JOIN_SUBMIT,
        label: "참여 시도",
        meaning: "이름과 비밀번호를 입력하고 '참여 / 수정'을 누른 순간.",
        drop: "여기서 많이 빠지면 비밀번호 요구가 부담이거나, 들어와서 무엇을 해야 할지 몰라 이탈한 것입니다. 첫 화면의 행동 유도를 점검하세요.",
      },
      {
        event: EVENTS.JOIN_SUCCESS,
        label: "참여 성공",
        meaning: "이름 중복이나 비밀번호 불일치 없이 통과.",
        drop: "시도 대비 손실은 이름 충돌·비밀번호 오류율입니다. 손실이 크면 에러 메시지를 더 친절하게 바꿔야 합니다.",
      },
      {
        event: EVENTS.SCHEDULE_SAVE,
        label: "일정 저장",
        meaning:
          "가능한 시간을 선택하고 저장까지 완료. 참여자가 실제 데이터를 기여한 순간으로, 이 서비스가 존재하는 이유에 해당하는 단계입니다.",
        drop: "참여는 했는데 저장이 없다면 시간표 입력 UX 문제입니다. 드래그 방식을 모르거나 저장 버튼을 못 찾은 경우가 대부분입니다.",
      },
      {
        event: EVENTS.RANKING_OPEN,
        label: "골든타임 확인",
        meaning: "순위 화면을 열어 결과를 직접 확인. 사용자가 가치를 체감한 순간이라 재방문·재사용의 선행 지표가 됩니다.",
        drop: "저장까지 하고 결과를 안 보면 결과 화면의 존재를 모르는 것입니다. 저장 직후 순위로 안내하는 흐름을 검토하세요.",
      },
    ],
  },
];

/**
 * 테이블 성숙도 퍼널. 이벤트가 아니라 Table/User 컬렉션에서 직접 계산하므로
 * 이벤트 수집을 붙이기 이전의 과거 데이터까지 전부 소급 적용된다.
 */
const MATURITY_FUNNEL = {
  key: "maturity",
  title: "테이블 성숙도 퍼널",
  unit: "개",
  question: "만들어진 테이블이 실제로 모임 조율까지 도달하는가?",
  meaning:
    "생성된 테이블이 참여 인원을 얼마나 모았는지를 보여줍니다. 이벤트가 아니라 실제 DB 기록으로 계산하기 때문에 이벤트 수집을 붙이기 전에 만들어진 테이블도 그대로 집계되며, 서비스가 실제로 쓸모 있었던 비율을 가장 정직하게 보여줍니다.",
  steps: [
    {
      threshold: 0,
      label: "생성된 테이블",
      meaning: "지금까지 만들어진 전체 테이블 수.",
      drop: "",
    },
    {
      threshold: 1,
      label: "참여자 1명 이상",
      meaning: "링크가 최소 한 번은 실제로 사용됨.",
      drop: "참여자 0명 테이블 비율이 높다면 만들고 나서 공유가 이뤄지지 않는다는 뜻입니다. 생성 직후 공유 안내를 강화해야 합니다.",
    },
    {
      threshold: 2,
      label: "참여자 2명 이상",
      meaning: "여러 사람의 일정을 겹쳐볼 수 있게 된 상태로, 일정 '조율'이 성립하는 최소 조건입니다.",
      drop: "1명에서 멈춘 테이블이 많다면 초대받은 사람이 참여까지 오지 않는 것입니다. 참여 퍼널의 이탈 구간과 함께 보세요.",
    },
    {
      threshold: 3,
      label: "참여자 3명 이상",
      meaning: "실질적인 그룹 조율이 일어난 테이블.",
      drop: "",
    },
    {
      threshold: 5,
      label: "참여자 5명 이상",
      meaning: "활발하게 쓰인 모임. 이 비율이 서비스의 진짜 성공 사례 비중입니다.",
      drop: "",
    },
  ],
};

module.exports = { EVENTS, EVENT_NAMES, FUNNELS, MATURITY_FUNNEL };
