/**
 * 이메일 전송 설정 (부스 운영자 1회 설정)
 *
 * EmailJS 무료 플랜은 첨부파일 불가 → ImgBB에 사진 업로드 후 링크를 메일로 전송
 *
 * 1. EmailJS (완료)
 * 2. https://api.imgbb.com/ → Get API Key (무료)
 * 3. EmailJS 템플릿 Content에 아래 추가:
 *
 *    {{message}}
 *
 *    📸 사진 다운로드:
 *    {{photo_url}}
 */
window.EMAIL_CONFIG = {
  enabled: true,
  publicKey: 'zNzN8VrzebObKrgI2',
  serviceId: 'service_un0z84u',
  templateId: 'template_unyo39x',
  imgbbKey: 'dae8597c0d3cc19c89a1b297c134f052',
  monthlyEmailLimit: 200, // EmailJS 무료 한도 — 넘으면 전송 차단 (자동 과금 없음)
};
