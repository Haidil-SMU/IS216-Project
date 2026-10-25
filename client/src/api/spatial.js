import axios from 'axios'

const API_URL = '/api/spatial'
const data = (response) => response.data

const household = (id) => `${API_URL}/households/${id}`
const room = (id) => `${API_URL}/rooms/${id}`

export const getCurrentHousehold = () => axios.get(`${API_URL}/current`).then(data)
export const getFloorplan = (householdId) => axios.get(`${household(householdId)}/floorplan`).then(data)
export const restoreLayout = (householdId, rooms) => axios.put(`${household(householdId)}/layout`, { rooms }).then(data)

export const setRoomRect = (householdId, roomId, rect) => axios.put(`${household(householdId)}/room-rect`, { roomId, rect }).then(data)
export const addOpening = (householdId, roomId, applianceTypeKey) =>
  axios.post(`${household(householdId)}/openings`, { roomId, applianceTypeKey }).then(data)
export const moveOpening = (householdId, roomId, placementId, wall, t) =>
  axios.put(`${household(householdId)}/openings/${placementId}`, { roomId, wall, t }).then(data)
export const removeOpening = (householdId, roomId, placementId) =>
  axios.delete(`${household(householdId)}/openings/${placementId}`, { params: { roomId } }).then(data)

export const addPlacement = (roomId, placement) => axios.post(`${room(roomId)}/placements`, placement).then(data)
export const movePlacement = (roomId, placementId, pos) => axios.put(`${room(roomId)}/placements/${placementId}`, pos).then(data)
export const removePlacement = (roomId, placementId) => axios.delete(`${room(roomId)}/placements/${placementId}`)
export const saveRoomPlacements = (roomId, placements) => axios.put(`${room(roomId)}/placements`, { placements }).then(data)