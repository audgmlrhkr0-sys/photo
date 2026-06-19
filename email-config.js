/**
 * 이메일 전송 설정 (부스 운영자가 1회만 설정)
 *
 * 방문객은 이메일만 입력하면 바로 받습니다. (주소별 인증 없음)
 *
 * 설정 방법:
 * 1. https://www.emailjs.com 가입 (무료)
 * 2. Email Services → Gmail 등 연결
 * 3. Email Templates → 새 템플릿
 *    - To Email: {{to_email}}
 *    - Subject: {{subject}}
 *    - Content: {{message}}
 * 4. Account → Public Key 복사
 * 5. 아래 값 입력 후 enabled: true
 */
window.EMAIL_CONFIG = {
  enabled: true,
  publicKey: 'zNzN8VrzebObKrgI2',
  serviceId: 'service_un0z84u',
  templateId: 'template_unyo39x',
};
