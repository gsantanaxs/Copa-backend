import express from 'express'
import { supabase, supabaseAdmin } from '../supabase/client.js'
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

        // Caso o e-mail já exista, o Supabase pode retornar sucesso sem erro,
        // mas sem um usuário válido (ou um usuário "fantasma" sem identidades).
        // Tratamos isso explicitamente para não quebrar com erro 500 genérico.
        if (!authData.user) {
            return res.status(409).json({
                error: 'Não foi possível concluir o cadastro. Verifique se o e-mail já está em uso.'
            })
        }

        // Criar perfil na tabela usuarios usando o client admin (service role).
        // Importante: se a confirmação de e-mail estiver ativa no projeto,
        // o signUp não retorna sessão, então o client anônimo não está
        // autenticado nesse momento e um insert protegido por RLS falharia.
        const { error: perfilError } = await supabaseAdmin
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
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
    }

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

    try {
        const { data: { user }, error } = await supabase.auth.getUser(token)

        if (error || !user) {
            return res.status(401).json({ error: 'Token inválido' })
        }

        res.json({ valid: true, user })
    } catch (error) {
        return res.status(500).json({ error: 'Erro ao validar token' })
    }
})

// Rota de logout
router.post('/logout', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1]

    try {
        if (token) {
            // admin.signOut exige privilégios de service role
            await supabaseAdmin.auth.admin.signOut(token)
        }

        res.json({ success: true, message: 'Logout realizado' })
    } catch (error) {
        console.error('Erro no logout:', error)
        res.status(500).json({ error: 'Erro ao realizar logout' })
    }
})

export default router