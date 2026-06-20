/**
 * 개인정보처리방침 공개 HTML.
 *
 * Play Store는 공개 접근 가능한 URL을 요구하므로 백엔드가 `GET /privacy`로 서빙한다.
 * Flutter 앱의 PrivacyPolicyPage(`lib/features/legal/.../privacy_policy_page.dart`)와
 * 동일한 내용을 유지해야 한다. 내용 변경 시 양쪽을 함께 갱신할 것.
 */
export const PRIVACY_POLICY_EFFECTIVE_DATE = '2026-05-22';

export const PRIVACY_POLICY_HTML = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="index, follow" />
  <title>스트라이크 로그 개인정보처리방침</title>
  <style>
    :root { color-scheme: light dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
        "Helvetica Neue", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif;
      line-height: 1.7;
      color: #1a1a1a;
      background: #ffffff;
      -webkit-text-size-adjust: 100%;
    }
    .wrap { max-width: 720px; margin: 0 auto; padding: 32px 20px 64px; }
    h1 { font-size: 22px; margin: 0 0 4px; }
    .eff { color: #6b7280; font-size: 13px; margin: 0 0 24px; }
    .intro { margin: 0 0 28px; }
    h2 { font-size: 16px; margin: 28px 0 8px; }
    ul { margin: 0; padding-left: 20px; }
    li { margin: 0 0 6px; }
    footer { margin-top: 40px; color: #6b7280; font-size: 12px; }
    a { color: #135BEC; }
    @media (prefers-color-scheme: dark) {
      body { color: #e5e7eb; background: #0f1115; }
      .eff, footer { color: #9ca3af; }
    }
  </style>
</head>
<body>
  <main class="wrap">
    <h1>스트라이크 로그 개인정보처리방침</h1>
    <p class="eff">시행일: ${PRIVACY_POLICY_EFFECTIVE_DATE}</p>

    <p class="intro">
      김호정(이하 "운영자")는 「개인정보 보호법」 등 관련 법령을 준수하여
      이용자의 개인정보를 안전하게 처리하기 위해 본 개인정보처리방침을 마련합니다.
    </p>

    <h2>1. 수집하는 개인정보 항목</h2>
    <ul>
      <li>필수: 이메일 주소, 비밀번호(단방향 암호화), 닉네임</li>
      <li>선택: 프로필 이미지</li>
      <li>서비스 이용 과정 자동 수집: 게임 점수·플레이 일자·위치(볼링장명), 시리즈 기록, 클럽 가입/활동 내역, 기기 식별자, 광고 식별자(Advertising ID), FCM 토큰, OS/앱 버전, 오류 로그</li>
    </ul>

    <h2>2. 개인정보 수집 및 이용 목적</h2>
    <ul>
      <li>회원 식별 및 로그인 인증</li>
      <li>볼링 점수·통계·랭킹 산출 및 표시</li>
      <li>클럽 가입 신청 및 멤버 관리, 클럽 게임 알림</li>
      <li>서비스 이용 관련 푸시 알림(베스트 갱신, 배지 획득 등)</li>
      <li>광고 게재 및 광고 성과 측정(AdMob)</li>
      <li>오류 진단 및 서비스 품질 개선</li>
      <li>문의 응대 및 분쟁 처리</li>
    </ul>

    <h2>3. 개인정보의 보유 및 이용 기간</h2>
    <ul>
      <li>회원 탈퇴 시 또는 보유 목적 달성 시 지체 없이 파기</li>
      <li>관련 법령에 따라 일정 기간 보관이 필요한 경우 해당 기간 동안 보관 (예: 「전자상거래 등에서의 소비자보호에 관한 법률」에 따른 계약/청약철회·대금결제·소비자 불만 또는 분쟁처리에 관한 기록 등)</li>
    </ul>

    <h2>4. 개인정보의 제3자 제공</h2>
    <ul>
      <li>운영자는 이용자의 개인정보를 본 방침에서 명시한 범위를 넘어 제3자에게 제공하지 않습니다.</li>
      <li>법령에 의거하거나 수사 목적으로 적법한 절차에 따라 요구되는 경우 예외로 합니다.</li>
    </ul>

    <h2>5. 개인정보 처리의 위탁</h2>
    <ul>
      <li>Google LLC (Firebase Cloud Messaging) — 푸시 알림 전송</li>
      <li>Google LLC (AdMob) — 광고 게재 및 광고 식별자 처리</li>
      <li>Functional Software, Inc. (Sentry) — 오류 진단 로그 수집</li>
      <li>각 수탁사는 위탁 업무 수행 목적 이외에 개인정보를 이용하지 않으며, 운영자는 수탁사가 정한 개인정보 보호 약관을 준수합니다.</li>
    </ul>

    <h2>6. 이용자 및 법정대리인의 권리</h2>
    <ul>
      <li>이용자는 언제든지 본인의 개인정보 열람·정정·삭제·처리정지를 요청할 수 있습니다.</li>
      <li>계정 삭제는 앱 내 설정 또는 운영자 이메일로 요청할 수 있으며, 운영자는 지체 없이 처리합니다.</li>
    </ul>

    <h2>7. 개인정보의 안전성 확보 조치</h2>
    <ul>
      <li>비밀번호는 단방향 암호화하여 저장</li>
      <li>전송 구간 HTTPS 암호화</li>
      <li>서버 접근 권한 최소화 및 접근 기록 보관</li>
      <li>주기적인 보안 점검 및 취약점 패치</li>
    </ul>

    <h2>8. 자동 수집 장치(쿠키 등)</h2>
    <ul>
      <li>본 앱은 웹 쿠키를 사용하지 않습니다.</li>
      <li>단, 푸시 알림 전송을 위해 기기별 FCM 토큰을 수집·저장하며, 이용자는 앱 알림 권한을 통해 거부할 수 있습니다.</li>
    </ul>

    <h2>9. 개인정보 보호책임자 및 문의</h2>
    <ul>
      <li>책임자: 김호정</li>
      <li>연락처: <a href="mailto:dev.hojung@gmail.com">dev.hojung@gmail.com</a></li>
    </ul>

    <h2>10. 고지의 의무</h2>
    <ul>
      <li>본 방침의 내용 추가·삭제·수정이 있을 경우, 시행 7일 전부터 앱 내 공지 또는 푸시 알림을 통해 사전 안내합니다.</li>
    </ul>

    <footer>스트라이크 로그 (Strike Log)</footer>
  </main>
</body>
</html>`;
