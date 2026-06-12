const API_URL = 'http://localhost:3000/api'

class API {
    constructor() {
        this.token = localStorage.getItem('token')
    }

    setToken(token) {
        this.token = token
        if (token) {
            localStorage.setItem('token', token)
        } else {
            localStorage.removeItem('token')
        }
    }

    getHeaders() {
        const headers = {
            'Content-Type': 'application/json'
        }
        
        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`
        }
        
        return headers
    }

    async request(endpoint, options = {}) {
        try {
            const response = await fetch(`${API_URL}${endpoint}`, {
                ...options,
                headers: this.getHeaders()
            })
            
            const data = await response.json()
            
            if (!response.ok) {
                throw new Error(data.error || 'Erro na requisição')
            }
            
            return data
        } catch (error) {
            console.error('API Error:', error)
            throw error
        }
    }

    // Auth
    async register(email, password, nome) {
        return this.request('/auth/registrar', {
            method: 'POST',
            body: JSON.stringify({ email, password, nome })
        })
    }

    async login(email, password) {
        const data = await this.request('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        })
        
        if (data.token) {
            this.setToken(data.token)
        }
        
        return data
    }

    async logout() {
        await this.request('/auth/logout', { method: 'POST' })
        this.setToken(null)
    }

    // Estádios
    async getEstadios(page = 1, filtros = {}) {
        const params = new URLSearchParams({ page, ...filtros })
        return this.request(`/estadios?${params}`)
    }

    async createAvaliacaoEstadio(data) {
        return this.request('/estadios', {
            method: 'POST',
            body: JSON.stringify(data)
        })
    }

    async getRankingEstadios() {
        return this.request('/estadios/ranking')
    }

    // Transportes
    async getTransportes(cidade = null, tipo = null) {
        const params = new URLSearchParams()
        if (cidade) params.append('cidade', cidade)
        if (tipo) params.append('tipo', tipo)
        return this.request(`/transportes?${params}`)
    }

    async createAvaliacaoTransporte(data) {
        return this.request('/transportes', {
            method: 'POST',
            body: JSON.stringify(data)
        })
    }

    // Restaurantes
    async getRestaurantes(filtros = {}) {
        const params = new URLSearchParams(filtros)
        return this.request(`/restaurantes?${params}`)
    }

    async createAvaliacaoRestaurante(formData) {
        const response = await fetch(`${API_URL}/restaurantes`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.token}`
            },
            body: formData
        })
        
        if (!response.ok) {
            throw new Error('Erro ao enviar avaliação')
        }
        
        return response.json()
    }

    // Likes
    async toggleLike(avaliacao_id, tipo_avaliacao) {
        return this.request('/likes', {
            method: 'POST',
            body: JSON.stringify({ avaliacao_id, tipo_avaliacao })
        })
    }
}

export const api = new API()