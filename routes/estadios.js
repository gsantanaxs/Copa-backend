import express from 'express'
import { supabase, supabaseAdmin } from '../supabase/client.js'
import { verificarToken } from '../middleware/auth.js'
import { body, query, validationResult } from 'express-validator'

const router = express.Router()

// ============================================
// GET - Listar avaliações de estádios (com filtros e paginação)
// ============================================
router.get('/', [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 50 }),
    query('cidade').optional().isString(),
    query('estadio').optional().isString(),
    query('minNota').optional().isInt({ min: 1, max: 5 })
], async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1
        const limit = parseInt(req.query.limit) || 10
        const offset = (page - 1) * limit
        
        // 🔧 USANDO A VIEW CRIADA NO SUPABASE
        let query = supabase
            .from('avaliacoes_estadios_view')
            .select('*', { count: 'exact' })
            .order('data_avaliacao', { ascending: false })
            .range(offset, offset + limit - 1)
        
        // Aplicar filtros
        if (req.query.cidade) {
            query = query.ilike('cidade', `%${req.query.cidade}%`)
        }
        
        if (req.query.estadio) {
            query = query.ilike('estadio_nome', `%${req.query.estadio}%`)
        }
        
        if (req.query.minNota) {
            query = query.gte('nota_geral', parseInt(req.query.minNota))
        }
        
        const { data, error, count } = await query
        
        if (error) {
            return res.status(500).json({ error: error.message })
        }
        
        // 🔧 Formatar os dados para o frontend
        const formattedData = data.map(item => ({
            ...item,
            usuarios: {
                id: item.usuario_id,
                email: item.usuario_email,
                nome: item.usuario_nome || item.usuario_email?.split('@')[0] || 'Anônimo'
            }
        }))
        
        res.json({
            data: formattedData,
            pagination: {
                page,
                limit,
                total: count,
                totalPages: Math.ceil(count / limit)
            }
        })
        
    } catch (error) {
        console.error('Erro ao listar avaliações:', error)
        res.status(500).json({ error: 'Erro interno do servidor' })
    }
})

// ============================================
// GET - Buscar uma avaliação por ID
// ============================================
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params
        
        const { data, error } = await supabase
            .from('avaliacoes_estadios_view')
            .select('*')
            .eq('id', id)
            .single()
        
        if (error) {
            return res.status(404).json({ error: 'Avaliação não encontrada' })
        }
        
        // Formatar dados
        const formattedData = {
            ...data,
            usuarios: {
                id: data.usuario_id,
                email: data.usuario_email,
                nome: data.usuario_nome || data.usuario_email?.split('@')[0] || 'Anônimo'
            }
        }
        
        res.json({ success: true, data: formattedData })
        
    } catch (error) {
        console.error('Erro ao buscar avaliação:', error)
        res.status(500).json({ error: 'Erro interno do servidor' })
    }
})

// ============================================
// GET - Estatísticas por cidade
// ============================================
router.get('/estatisticas', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('avaliacoes_estadios')
            .select('cidade, nota_geral, nota_seguranca, nota_acesso')
        
        if (error) {
            return res.status(500).json({ error: error.message })
        }
        
        // Calcular estatísticas por cidade
        const stats = data.reduce((acc, curr) => {
            if (!acc[curr.cidade]) {
                acc[curr.cidade] = {
                    total: 0,
                    somaGeral: 0,
                    somaSeguranca: 0,
                    somaAcesso: 0
                }
            }
            acc[curr.cidade].total++
            acc[curr.cidade].somaGeral += curr.nota_geral
            acc[curr.cidade].somaSeguranca += curr.nota_seguranca
            acc[curr.cidade].somaAcesso += curr.nota_acesso
            return acc
        }, {})
        
        const resultado = Object.entries(stats).map(([cidade, dados]) => ({
            cidade,
            mediaGeral: (dados.somaGeral / dados.total).toFixed(1),
            mediaSeguranca: (dados.somaSeguranca / dados.total).toFixed(1),
            mediaAcesso: (dados.somaAcesso / dados.total).toFixed(1),
            totalAvaliacoes: dados.total
        }))
        
        res.json(resultado)
        
    } catch (error) {
        console.error('Erro ao buscar estatísticas:', error)
        res.status(500).json({ error: 'Erro interno do servidor' })
    }
})

// ============================================
// POST - Criar nova avaliação (requer autenticação)
// ============================================
router.post('/', verificarToken, [
    body('estadio_nome').notEmpty().withMessage('Nome do estádio é obrigatório').trim(),
    body('cidade').notEmpty().withMessage('Cidade é obrigatória').trim(),
    body('nota_geral').isInt({ min: 1, max: 5 }).withMessage('Nota geral deve ser entre 1 e 5'),
    body('nota_acesso').isInt({ min: 1, max: 5 }).withMessage('Nota de acesso deve ser entre 1 e 5'),
    body('nota_seguranca').isInt({ min: 1, max: 5 }).withMessage('Nota de segurança deve ser entre 1 e 5'),
    body('nota_estrutura').isInt({ min: 1, max: 5 }).withMessage('Nota de estrutura deve ser entre 1 e 5'),
    body('comentario').optional().trim()
], async (req, res) => {
    try {
        const errors = validationResult(req)
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() })
        }
        
        const avaliacao = {
            ...req.body,
            usuario_id: req.usuario.id,
            data_avaliacao: new Date()
        }
        
        const { data, error } = await supabase
            .from('avaliacoes_estadios')
            .insert([avaliacao])
            .select()
            .single()
        
        if (error) {
            return res.status(500).json({ error: error.message })
        }
        
        res.status(201).json({ success: true, data })
        
    } catch (error) {
        console.error('Erro ao criar avaliação:', error)
        res.status(500).json({ error: 'Erro interno do servidor' })
    }
})

// ============================================
// PUT - Atualizar avaliação (apenas dono)
// ============================================
router.put('/:id', verificarToken, async (req, res) => {
    try {
        const { id } = req.params
        
        // Verificar se é dono
        const { data: avaliacaoExistente } = await supabase
            .from('avaliacoes_estadios')
            .select('usuario_id')
            .eq('id', id)
            .single()
        
        if (!avaliacaoExistente || avaliacaoExistente.usuario_id !== req.usuario.id) {
            return res.status(403).json({ error: 'Você só pode editar suas próprias avaliações' })
        }
        
        const { data, error } = await supabase
            .from('avaliacoes_estadios')
            .update(req.body)
            .eq('id', id)
            .select()
            .single()
        
        if (error) {
            return res.status(500).json({ error: error.message })
        }
        
        res.json({ success: true, data })
        
    } catch (error) {
        console.error('Erro ao atualizar avaliação:', error)
        res.status(500).json({ error: 'Erro interno do servidor' })
    }
})

// ============================================
// DELETE - Remover avaliação (apenas dono ou admin)
// ============================================
router.delete('/:id', verificarToken, async (req, res) => {
    try {
        const { id } = req.params
        
        // Verificar permissão
        const { data: avaliacaoExistente } = await supabase
            .from('avaliacoes_estadios')
            .select('usuario_id')
            .eq('id', id)
            .single()
        
        if (!avaliacaoExistente) {
            return res.status(404).json({ error: 'Avaliação não encontrada' })
        }
        
        // Verificar se é admin
        const isAdmin = req.usuario.email?.includes('admin') || req.usuario.email?.includes('@admin')
        
        if (avaliacaoExistente.usuario_id !== req.usuario.id && !isAdmin) {
            return res.status(403).json({ error: 'Sem permissão para deletar' })
        }
        
        const { error } = await supabase
            .from('avaliacoes_estadios')
            .delete()
            .eq('id', id)
        
        if (error) {
            return res.status(500).json({ error: error.message })
        }
        
        res.json({ success: true, message: 'Avaliação removida' })
        
    } catch (error) {
        console.error('Erro ao deletar avaliação:', error)
        res.status(500).json({ error: 'Erro interno do servidor' })
    }
})

// ============================================
// GET - Ranking dos melhores estádios
// ============================================
router.get('/ranking', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('avaliacoes_estadios')
            .select('estadio_nome, cidade, nota_geral')
        
        if (error) {
            return res.status(500).json({ error: error.message })
        }
        
        // Calcular média por estádio
        const ranking = data.reduce((acc, curr) => {
            const key = `${curr.estadio_nome}|${curr.cidade}`
            if (!acc[key]) {
                acc[key] = {
                    estadio: curr.estadio_nome,
                    cidade: curr.cidade,
                    totalNotas: 0,
                    quantidade: 0
                }
            }
            acc[key].totalNotas += curr.nota_geral
            acc[key].quantidade++
            return acc
        }, {})
        
        const resultado = Object.values(ranking)
            .map(item => ({
                ...item,
                media: (item.totalNotas / item.quantidade).toFixed(1)
            }))
            .sort((a, b) => b.media - a.media)
            .slice(0, 10)
        
        res.json(resultado)
        
    } catch (error) {
        console.error('Erro ao buscar ranking:', error)
        res.status(500).json({ error: 'Erro interno do servidor' })
    }
})

export default router
