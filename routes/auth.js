import express from 'express'
import { supabase } from '../supabase/client.js'
import { body, validationResult } from 'express-validator'

const router = express.Router()

// Rota de cadastro
router.post('/registrar', [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
    body('nome').notEmpty().trim()
], async (req, res) => {
    // Validação
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
    }
    
    const { email, password, nome } = req.body
    
    try {
        // Criar usuário no Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: { nome_completo: nome }
            }
        })
        
        if (authError) throw authError
        
        // Criar perfil na tabela usuarios
        const { error: perfilError } = await supabase
            .from('usuarios')
            .insert([
                { 
                    id: authData.user.id, 
                    email, 
                    nome,
                    data_cadastro: new Date()
                }
            ])
        
        if (perfilError) throw perfilError
        
        res.status(201).json({ 
            success: true, 
            message: 'Usuário criado com sucesso',
            user: authData.user 
        })
        
    } catch (error) {
        console.error('Erro no cadastro:', error)
        res.status(500).json({ error: error.message })
    }
})

// Rota de login
router.post('/login', [
    body('email').isEmail(),
    body('password').notEmpty()
], async (req, res) => {
    const { email, password } = req.body
    
    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        })
        
        if (error) throw error
        
        res.json({ 
            success: true, 
            token: data.session.access_token,
            user: data.user,
            expires_at: data.session.expires_at
        })
        
    } catch (error) {
        res.status(401).json({ error: 'Email ou senha inválidos' })
    }
})

// Rota para validar token
router.get('/validar', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1]
    
    if (!token) {
        return res.status(401).json({ error: 'Token não fornecido' })
    }
    
    const { data: { user }, error } = await supabase.auth.getUser(token)
    
    if (error) {
        return res.status(401).json({ error: 'Token inválido' })
    }
    
    res.json({ valid: true, user })
})

// Rota de logout
router.post('/logout', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1]
    
    if (token) {
        await supabase.auth.admin.signOut(token)
    }
    
    res.json({ success: true, message: 'Logout realizado' })
})

export default router