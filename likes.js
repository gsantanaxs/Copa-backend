import express from 'express'
import { supabase, supabaseAdmin } from '../supabase/client.js'
import { verificarToken, usuarioEhAdmin } from '../middleware/auth.js'
import { body, query, validationResult } from 'express-validator'

const router = express.Router()

// Campos que o usuário pode atualizar numa avaliação existente.
// Evita que campos sensíveis (usuario_id, id, data_avaliacao) sejam sobrescritos via body.
const CAMPOS_ATUALIZAVEIS = [
    'estadio_nome',
    'cidade',
    'nota_geral',
    'nota_acesso',
    'nota_seguranca',
    'nota_estrutura',
    'comentario'
]

function filtrarCamposAtualizaveis(body) {
    const resultado = {}
    for (const campo of CAMPOS_ATUALIZAVEIS) {
        if (body[campo] !== undefined) {
            resultado[campo] = body[campo]
        }
    }
    return resultado
}

// GET - Listar avaliações de estádios (com filtros e paginação)
router.get('/', [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 50 }),
    query('cidade').optional().isString(),
    query('estadio').optional().isString(),
    query('minNota').optional().isInt({ min: 1, max: 5 })
], async (req, res) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
    }

    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 10
    const offset = (page - 1) * limit

    // Renomeado para "consulta" para não conflitar com a função `query`
    // importada do express-validator (bug original: shadowing).
    let consulta = supabase
        .from('avaliacoes_estadios')
        .select(`
            *,
            usuarios!usuario_id (id, nome, email)
        `, { count: 'exact' })
        .order('data_avaliacao', { ascending: false })
        .range(offset, offset + limit - 1)

    // Aplicar filtros
    if (req.query.cidade) {
        consulta = consulta.ilike('cidade', `%${req.query.cidade}%`)
    }

    if (req.query.estadio) {
        consulta = consulta.ilike('estadio_nome', `%${req.query.estadio}%`)
    }

    if (req.query.minNota) {
        consulta = consulta.gte('nota_geral', parseInt(req.query.minNota))
    }

    const { data, error, count } = await consulta

    if (error) {
        return res.status(500).json({ error: error.message })
    }

    res.json({
        data,
        pagination: {
            page,
            limit,
            total: count,
            totalPages: Math.ceil(count / limit)
        }
    })
})

// GET - Estatísticas por cidade
router.get('/estatisticas', async (req, res) => {
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
})

// POST - Criar nova avaliação (requer autenticação)
router.post('/', verificarToken, [
    body('estadio_nome').notEmpty().trim(),
    body('cidade').notEmpty().trim(),
    body('nota_geral').isInt({ min: 1, max: 5 }),
    body('nota_acesso').isInt({ min: 1, max: 5 }),
    body('nota_seguranca').isInt({ min: 1, max: 5 }),
    body('nota_estrutura').isInt({ min: 1, max: 5 }),
    body('comentario').optional().trim()
], async (req, res) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
    }

    const avaliacao = {
        ...filtrarCamposAtualizaveis(req.body),
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

    // Disparar evento Realtime (já é automático no Supabase)
    res.status(201).json({ success: true, data })
})

// PUT - Atualizar avaliação (apenas dono)
router.put('/:id', verificarToken, [
    body('estadio_nome').optional().notEmpty().trim(),
    body('cidade').optional().notEmpty().trim(),
    body('nota_geral').optional().isInt({ min: 1, max: 5 }),
    body('nota_acesso').optional().isInt({ min: 1, max: 5 }),
    body('nota_seguranca').optional().isInt({ min: 1, max: 5 }),
    body('nota_estrutura').optional().isInt({ min: 1, max: 5 }),
    body('comentario').optional().trim()
], async (req, res) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
    }

    const { id } = req.params

    // Verificar se é dono
    const { data: avaliacaoExistente, error: erroConsulta } = await supabase
        .from('avaliacoes_estadios')
        .select('usuario_id')
        .eq('id', id)
        .single()

    if (erroConsulta || !avaliacaoExistente) {
        return res.status(404).json({ error: 'Avaliação não encontrada' })
    }

    if (avaliacaoExistente.usuario_id !== req.usuario.id) {
        return res.status(403).json({ error: 'Você só pode editar suas próprias avaliações' })
    }

    // Apenas campos permitidos são atualizados — usuario_id, id e
    // data_avaliacao não podem ser sobrescritos pelo cliente.
    const camposAtualizar = filtrarCamposAtualizaveis(req.body)

    if (Object.keys(camposAtualizar).length === 0) {
        return res.status(400).json({ error: 'Nenhum campo válido para atualizar' })
    }

    const { data, error } = await supabase
        .from('avaliacoes_estadios')
        .update(camposAtualizar)
        .eq('id', id)
        .select()
        .single()

    if (error) {
        return res.status(500).json({ error: error.message })
    }

    res.json({ success: true, data })
})

// DELETE - Remover avaliação (apenas dono ou admin)
router.delete('/:id', verificarToken, async (req, res) => {
    const { id } = req.params

    // Verificar permissão
    const { data: avaliacaoExistente, error: erroConsulta } = await supabase
        .from('avaliacoes_estadios')
        .select('usuario_id')
        .eq('id', id)
        .single()

    if (erroConsulta || !avaliacaoExistente) {
        return res.status(404).json({ error: 'Avaliação não encontrada' })
    }

    // Verificação de admin real, consultando a tabela `perfis` no banco
    // (antes: heurística insegura baseada em substring do e-mail).
    const ehDono = avaliacaoExistente.usuario_id === req.usuario.id
    const ehAdmin = ehDono ? false : await usuarioEhAdmin(req.usuario.id)

    if (!ehDono && !ehAdmin) {
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
})

// GET - Ranking dos melhores estádios
router.get('/ranking', async (req, res) => {
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
        .slice(0, 10) // Top 10

    res.json(resultado)
})

export default router