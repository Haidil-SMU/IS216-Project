// import './assets/main.css'
import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { installAuthInterceptor } from './stores/auth'

// Import Bootstrap CSS and JS
import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap/dist/js/bootstrap.bundle.min.js'
import './assets/singpass.css'

const app = createApp(App)

app.use(createPinia())
app.use(router)
installAuthInterceptor(router)

app.mount('#app')
