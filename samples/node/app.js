//
// 1. Run: node app.js
// 2. On browser open http://localhost:3009
//

var express = require('express');

var residue = require('residue');
var logger = residue.getLogger('sample-app');

var app = express();

var residueParams = {
    app: 'Sample NodeJS Client App',
    host: 'localhost',
    connect_port: 8777,
    access_codes: [
        { logger_id: 'sample-app', code: 'a2dcb' }
    ],
	/*
	utc_time: true,
	time_offset: 3600,
	plain_request: false,*/
	client_id: 'muflihun00102030',
	client_private_key: '-----BEGIN RSA PRIVATE KEY-----\
MIIEpAIBAAKCAQEA7FRIrSdEHB0sLds0sHzdZtSeN6RUHtvPRhjk9wWThhq7b0OV\
BToWLHip9Jrwg69sVn8MtYaYbd9KtZSA9rHdYOEpplunphNwzq9BEQMsqs2ELFr6\
Eh1dwIPH2UcOeyd2W0OFYYjLdDXOUrgBz8LEliP1c0IMKc8gU4Z1welgDn60I4r6\
nVoeMBRR95xkcUyFuJ1Rw3Gg6z7cFYYqseJNGF5fguL0gqoBM+ZaZUieINx+NieW\
hzTdICcxXEIGb4m81edAo2HSif2q6777LUoYWefuZudbHyM5NtUZzBXwETXLArvK\
lOcdayIRKVfb/Fz7a/BRo0yG/rl/rjhPWzcTqQIBAwKCAQEAnY2FyMTYEr4dc+d4\
daiTmeMUJRg4FJKKLrtDT1kNBBHSSi0OA3wOyFBxTbygV8pIOaoIeQRlnpTceQ2r\
TyE+QJYbxD0abregicorYKzIcd5YHZH8DBOT1a0v5i9e/MT5ki0DllsyTXk0NyVW\
ioHYZBf494FdcTTAN675K/DqtFMwEGG5gk+ycReZeXsxCw8rAJedkE8I1KTs9wuH\
w10XK179PVc8JZqAH0elPRjfJ5Cq6bUl4Dd3rjbCd/OHw6pbb0Fac2Gsv4x3D/e0\
1dEdqgDLhJltnj0sZWCsQAm5uE3DuKCIgqkNJn5LPgSgZkuvxY/wtKkZzJJov4HH\
PAWagwKBgQD7JU1/Ib2aI0GwaB8kEvfSk65ZJ4HHnmGBiBM0cMqhvC74x4pTuddh\
wZyjtWMoumxD5pL+o874OyRLtwk3ArT1EJsrhRhXgWNyt3F9rXDO5mNMgRgRel5h\
El0dBPXzAIIstvhwL8raeC2WA9TCZSIstIHWDnu1jOsU41EeN5FFgwKBgQDw5arl\
OCT4Yy87WUR2zb3ypAuMQ3lMDeX3GuGqnAwImyDq31XGkGrfQ14+1EAmqxc58QTf\
ExKxX7DB8UuDx1U+nmoNcTb36UeFnFnuPx+c9INwnuklN2kVjGb6ZxFmfD74ttKN\
oR6vOTcKSHwo/clHDxaShdMqvvLNq6SGSZ1mYwKBgQCnbjOqFn5mwivK8BTCt0/h\
t8mQxQEvvuursAzNoIcWfXSl2lw30TpBK73CeOzF0Z2CmbdUbTSlfMLdJLDPVyNO\
CxIdA2WPq5ehz6D+c6CJ7uzdq2Vg/D7rYZNorflMqwFzJKWgH9yRpXO5V+MsQ2wd\
zavkCafOXfIN7OC+z7YuVwKBgQCgmRyY0Bill3TSO4L53n6hwrJdglDdXplPZ0Ec\
aAgFvMCclOPZtZyU15Qp4tVvHLomoK3qDLcg6nXWoN0ChON/FEazoM9P8NpZEuae\
1L+9+FegafDDekYOXZn8RLZEUtSlzzcJFhR00M9cMFLF/oYvX2RhrozHKfczx8ME\
MROZlwKBgQCmPgUCediRMlRrtYiLhsHhLJ11fSPDMcDLAn1CyNRqbUv2vm77rqf8\
SpzrO1MV7+Myv7mmnLwleG3jROKaB8zUHPqLQaeIV9M3dQs/iaPsu5NQ63TRzDK8\
Azh5HkbYBzmoDATt2QoQmenwcW0sBpaEgKsnUe5WozZJeizQ8d8igA==\
-----END RSA PRIVATE KEY-----'/*,
	server_public_key: '-----BEGIN PUBLIC KEY-----\
MIIEIDANBgkqhkiG9w0BAQEFAAOCBA0AMIIECAKCBAEAtIgyRQC73qFswUMw1L8X\
VlUpIA5hMzGZUDf4pkgCBOTgdSiHismAA12zDkBiFe6XQk/0KLaImBzzOAna3Hqz\
RNJi/EnEnO6we5JoLvX5YydFeHzSaiMiQi3AsJD2LgahA9MqPaWbbCZGkAGWty1C\
95dnijrIG+0ecuQsPeHdFTRxHYfMIjHGXrP5XwyQ0TDl+N7kIk3/FMtZAEcCkd+R\
OO0yDo11Pog3euG/HTS0EndB1XGFC6y7dHRznk5d8+Mtf8WO8GmpKGzPAGU52QID\
64NF8n76xqDaRB5+MdP/YAB44c6ez1hYyi+Wup236uAZMTyR9JJwaPXBuMQmB1uG\
lYQYPgcMFi7gXxtt+9oDerXFtOSspTVtyfUcp5WtzyhmiDgT1x61WZVZ2tXJMcYW\
HR9supTKX3tk/IP8ZOP8NGOfrCUz4k122SAnNKVj+5uBtnYVVjb0abybB/aV6Hut\
HYsYupXCqub5XhankRw37lh68rVTL8snNY/oMdHToL5FEsfiSVqmJaaK1IzGjE1d\
PW+wFPI0yPwcd4+dRXabmcQE/ddOXJXwvcTPrgGbUt0KuLvliTv0vMnDl60DFegY\
J1q7W6abV7D/LfCsQVr4d+MDkBx3NjbR9aQzUUb6s4T7rjDPJtklpKJhFYioZFdN\
KbDwACsiZE2XFQvHtkdjP0DqxNscWP2bduZ666YDu5dpAruMYTfvs/Lkbd5TpoDm\
NcNkiW9jh9MLEyeO84exozhCQlT/gA7PWtpXlp41PXK7vg5qeu4Qsbeud69H5043\
nukEb7T6U9Ugcjv/oxBN+9cxqTB7prW5GWUvwacKsfhWiFBZWAnHQ07i2C6BjdNC\
p+7ZmZCiqQ8bq96FZ+bh5jODRfR62dqaJm+IRd9w4mh830PBL0HZ3oouG4fNvuwh\
JbtUDo46sZeKBhVSBzmSEQORlQJOtFJviw0fcgbNobMXGVA26dKxkG8hmK2cuTII\
sjed2QYpReKUZMEhM60IOWDhf4l2hPUHtB7taNdvej/l509iJO9nao1NdsGakPbr\
/cmhkoOa29UOuAc0GuoMiNGmNlVl3sgWxQEHoFFQgJwGoxN3U3eywW4/mxyAyORc\
N1/zFd6X5v6FhrExAKzMB7HJIb0+CgOgJekQOHwyKmMGpjSkcQS30e7EirLrWbmV\
HQsz4hgKGA49MTG6+Rf8d5QSwATwU99e2oT46ITt74AI07Zh6Sm2usZYWBBS4W/r\
GOwWEpXooD5KIFgiu5YiyDnA3WGG8IVGBXTVzbyJVSQOImyq3VokFAeX02WB2q2c\
elWJOFBDpq5Xhew0jYUVAKLhKfsBq71UFFPCt8ywR9yjWxyKiKyT95A903tfW67o\
aQIBEQ==\
-----END PUBLIC KEY-----'*/
};

app.get('*', function(req, res, next) {
    logger.info('Request: ' + req.url);
    return next();
});

app.get('/', function (req, res) {
    logger.info('Another log');
    logger.info('Info Hello World!');
    res.send('Hello World!');
});

app.listen(3009, function () {
    console.log('Open http://localhost:3009 on browser');

    residue.connect(residueParams);
});
