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
app.use(helmet())
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Muitas requisições, tente novamente mais tarde'
})
app.use('/api/', limiter)

// ============================================
// ROTAS DA API
// ============================================
app.use('/api/auth', authRoutes)
app.use('/api/estadios', estadiosRoutes)
app.use('/api/transportes', transportesRoutes)
app.use('/api/restaurantes', restaurantesRoutes)
app.use('/api/likes', likesRoutes)

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date(),
        version: '1.0.0'
    })
})

// Rota raiz da API
app.get('/api', (req, res) => {
    res.json({
        message: 'FIFA 2026 Guide API',
        endpoints: {
            auth: '/api/auth',
            estadios: '/api/estadios',
            transportes: '/api/transportes',
            restaurantes: '/api/restaurantes',
            likes: '/api/likes',
            health: '/health'
        }
    })
})

// Middleware para rotas não encontradas
app.use((req, res) => {
    res.status(404).json({ 
        success: false,
        error: `Rota '${req.method} ${req.url}' não encontrada` 
    })
})

// Middleware de erro
app.use((err, req, res, next) => {
    console.error('Erro:', err)
    res.status(500).json({ 
        success: false,
        error: 'Erro interno do servidor',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    })
})

// ============================================
// EXPORTAR PARA VERCEL (SERVERLESS)
// ============================================
// 🔧 CORREÇÃO: Exportar app diretamente para a Vercel
export default app

// Iniciar servidor apenas se NÃO estiver na Vercel
if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`🚀 Servidor rodando em http://localhost:${PORT}`)
        console.log(`📝 API Docs: http://localhost:${PORT}/api/`)
        console.log(`✅ Ambiente: ${process.env.NODE_ENV || 'development'}`)
    })
}
