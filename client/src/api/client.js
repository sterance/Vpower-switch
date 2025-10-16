import axios from 'axios'

const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || '/api',
  timeout: 10000
})

client.interceptors.response.use(
  (response) => response,
  (error) => {
    return Promise.reject(error)
  }
)

export default client