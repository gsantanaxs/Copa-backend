import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import dotenv from 'dotenv'

// Importar rotas
import authRoutes from './routes/auth.js'
import estadiosRoutes from './routes/estadios.js'
import transportesRoutes from './routes/transportes.js'
import restaurantesRoutes from './routes/restaurantes.js'
import likesRoutes from './routes/likes.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3000

// Middlewares globais
app.use(helmet()) // Segurança
app.use(cors()) // CORS
app.use(express.json()) // Parse JSON
app.use(express.urlencoded({ extended: true })) // Parse URL encoded

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100, // Limite de 100 requisições por IP
    message: 'Muitas requisições, tente novamente mais tarde'
})
app.use('/api/', limiter)

// Rotas da API
app.use('/api/auth', authRoutes)
app.use('/api/estadios', estadiosRoutes)
app.use('/api/transportes', transportesRoutes)
app.use('/api/restaurantes', restaurantesRoutes)
app.use('/api/likes', likesRoutes)

// Rota de health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date(),
        version: '1.0.0'
    })
})

// Middleware para rotas não encontradas
app.use((req, res) => {
    res.status(404).json({ error: 'Rota não encontrada' })
})

// Middleware de erro global
app.use((err, req, res, next) => {
    console.error('Erro:', err)
    res.status(500).json({ 
        error: 'Erro interno do servidor',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    })
})

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando em http://localhost:${PORT}`)
    console.log(`📝 API Docs: http://localhost:${PORT}/api/`)
    console.log(`✅ Ambiente: ${process.env.NODE_ENV || 'development'}`)
})