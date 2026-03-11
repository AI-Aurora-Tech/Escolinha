import https from 'https';

const url = 'https://ais-pre-c7mxnl47iynkw4px4sankn-14145390286.us-east1.run.app/api/webhook/mercadopago';

https.get(url, (res) => {
  console.log('Status Code:', res.statusCode);
  console.log('Headers:', res.headers);
}).on('error', (e) => {
  console.error(e);
});
