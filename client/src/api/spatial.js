import axios from 'axios'

const API_URL = 'http://127.0.0.1:8000/api'
const data = (r) => r.data

export const getFlatTypes = () => axios.get(`${API_URL}/flat-types`).then(data)

export const createHousehold = (body) => axios.post(`${API_URL}/households`, body).then(data)

export const getFloorplan = (householdId) => axios.get(`${API_URL}/households/${householdId}/floorplan`).then(data)

export const changeFlatType = (householdId, flatTypeId) =>
  axios.put(`${API_URL}/households/${householdId}/flat-type`, { flatTypeId }).then(data)

export const saveRoomPlacements = (roomId, placements) =>
  axios.put(`${API_URL}/rooms/${roomId}/placements`, { placements }).then(data)

export const saveRoom = (roomId, body) => axios.put(`${API_URL}/rooms/${roomId}`, body).then(data)

export const addPlacement = (roomId, placement) => axios.post(`${API_URL}/rooms/${roomId}/placements`, placement).then(data)
export const movePlacement = (roomId, pid, pos) => axios.put(`${API_URL}/rooms/${roomId}/placements/${pid}`, pos).then(data)
export const removePlacement = (roomId, pid) => axios.delete(`${API_URL}/rooms/${roomId}/placements/${pid}`)
