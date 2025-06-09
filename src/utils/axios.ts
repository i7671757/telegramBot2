import axios from 'axios';

let csrf: string | null = null;

export async function initAxiosWithCsrf() {
  if (csrf) return; // Уже инициализировано
  const csrfReq = await axios(`${process.env.API_URL}keldi`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      crossDomain: true,
    },
    withCredentials: true,
  });
  let { data: res } = csrfReq;
  csrf = Buffer.from(res.result, 'base64').toString('ascii');
  axios.defaults.headers.common['X-Requested-With'] = 'XMLHttpRequest';
  axios.defaults.headers.common['X-CSRF-TOKEN'] = csrf;
  axios.defaults.headers.common['XCSRF-TOKEN'] = csrf;
}

export { axios }; 