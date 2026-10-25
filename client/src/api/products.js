import axios from 'axios'

// Brand/model rows for one appliance type: { typeKey, brand, model, priceSgd, kwhYear, tick?, verified }.
export const getProducts = (typeKey) => axios.get('/api/products', { params: { typeKey } }).then((r) => r.data)
