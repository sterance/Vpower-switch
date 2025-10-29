import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, Typography, Box, Stack, Tooltip, Fade, Chip, Switch, IconButton } from '@mui/material'
import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew'
import DeleteIcon from '@mui/icons-material/Delete'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import client from '../api/client'
import ConfirmDialog from './ConfirmDialog'

function MachineCard({ machine, onDeleted, onNotify }) {
  const [statusLoading, setStatusLoading] = useState(false)
  const [isOnline, setIsOnline] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showMac, setShowMac] = useState(false)
  const [showIp, setShowIp] = useState(false)
  const [showSsh, setShowSsh] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const fetchStatus = useCallback(async ({ silent } = { silent: false }) => {
    try {
      if (!silent) setStatusLoading(true)
      const res = await client.get(`/machines/${machine.id}/status`)
      setIsOnline(Boolean(res.data?.online))
    } catch (e) {
      // status fetch failures are non-fatal; keep previous state
    } finally {
      if (!silent) setStatusLoading(false)
    }
  }, [machine.id])

  useEffect(() => {
    fetchStatus()
    const id = setInterval(() => fetchStatus({ silent: true }), 8000)
    return () => clearInterval(id)
  }, [fetchStatus])

  const handleToggle = async () => {
    try {
      setToggling(true)
      if (isOnline) {
        await client.post(`/machines/${machine.id}/poweroff`)
        onNotify?.('power off requested', 'info')
      } else {
        await client.post(`/machines/${machine.id}/poweron`)
        onNotify?.('wake on lan sent', 'info')
      }
      setTimeout(() => fetchStatus({ silent: true }), 2000)
    } catch (e) {
      onNotify?.('failed to toggle power', 'error')
    } finally {
      setToggling(false)
    }
  }

  const handleDelete = () => {
    setConfirmDelete(true)
  }

  const confirmDeleteAction = async () => {
    try {
      setDeleting(true)
      await client.delete(`/machines/${machine.id}`)
      onNotify?.('machine deleted successfully', 'success')
      onDeleted?.(machine.id)
    } catch (e) {
      onNotify?.('failed to delete machine', 'error')
    } finally {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  const glowColor = isOnline ? 'rgba(76, 175, 80, 0.7)' : 'rgba(244, 67, 54, 0.7)'
  const iconColor = isOnline ? 'success.main' : 'error.main'

  return (
    <Card variant="outlined" sx={{ position: 'relative', overflow: 'visible', padding: '0.5rem' }}>
      <img src={`${machine.os}.png`} alt={machine.os} style={{ filter: 'saturate(0%)', position: 'absolute', top: '60%', left: '60%', transform: 'translate(-50%, -50%)', height: '125px', opacity: '0.1' }}/>
      <Box sx={{ position: 'absolute', top: '1.5rem', right: '1.9rem', display: 'flex', alignItems: 'center', gap: 3 }}>
        <Tooltip slots={{ transition: Fade }} title={isOnline ? 'turn off' : 'turn on'}>
          <span>
            <Box sx={{ display: 'inline-block', p: 0.5 }}>
              <Switch
                size="small"
                checked={isOnline}
                onChange={handleToggle}
                disabled={toggling || statusLoading}
                slotProps={{ input: { 'aria-label': 'toggle power' } }}
                sx={{
                  transform: 'scale(2)',
                  '& .MuiSwitch-switchBase.Mui-checked': {
                    color: '#f44336'
                  },
                  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                    backgroundColor: '#f44336'
                  },
                  '& .MuiSwitch-switchBase:not(.Mui-checked)': {
                    color: '#4caf50'
                  },
                  '& .MuiSwitch-switchBase:not(.Mui-checked) + .MuiSwitch-track': {
                    backgroundColor: '#4caf50'
                  }
                }}
              />
            </Box>
          </span>
        </Tooltip>
        <PowerSettingsNewIcon sx={{ color: iconColor, filter: `drop-shadow(0 0 10px ${glowColor})`, transform: 'scale(2)' }} />
      </Box>
      <Typography variant="h5" sx={{ padding:'1rem' }}>{machine.name}</Typography>
      <CardContent>
        <Stack spacing={0.5} sx={{ mt: 1 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="body2" color="text.secondary" sx={{ width: '2rem' }}>mac</Typography>
            <IconButton size="small" onClick={() => setShowMac(!showMac)}>
              {showMac ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
            </IconButton>
            <Chip size="small" label={showMac ? machine.mac : '••••••••••••'} variant="outlined" />
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="body2" color="text.secondary" sx={{ width: '2rem' }}>ip</Typography>
            <IconButton size="small" onClick={() => setShowIp(!showIp)}>
              {showIp ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
            </IconButton>
            <Chip size="small" label={showIp ? machine.ip : '•••••••••'} variant="outlined" />
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="body2" color="text.secondary" sx={{ width: '2rem' }}>ssh</Typography>
            <IconButton size="small" onClick={() => setShowSsh(!showSsh)}>
              {showSsh ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
            </IconButton>
            <Chip size="small" label={showSsh ? machine.sshUser : '••••••'} variant="outlined" />
          </Stack>
        </Stack>
      </CardContent>
      <Box sx={{ position: 'absolute', bottom: '1rem', right: '1rem', display: 'flex', alignItems: 'center', gap: 1 }}>
        <Tooltip slots={{ transition: Fade }} title="Delete">
          <span>
            <IconButton
              size="large"
              onClick={handleDelete}
              disabled={deleting}
              aria-label="delete machine"
              sx={{ transform: 'scale(1.5)' }}
            >
              <DeleteIcon fontSize="inherit" />
            </IconButton>
          </span>
        </Tooltip>
      </Box>
      <ConfirmDialog
        open={confirmDelete}
        title="Delete Machine"
        message={`Are you sure you want to delete ${machine.name}?`}
        confirmText="Delete"
        cancelText="Cancel"
        onClose={() => setConfirmDelete(false)}
        onConfirm={confirmDeleteAction}
      />
    </Card>
  )
}

export default MachineCard