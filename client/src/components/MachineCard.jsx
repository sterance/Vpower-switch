import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, Typography, Box, Stack, Tooltip, Fade, Chip, Switch } from '@mui/material'
import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew'
import client from '../api/client'

function MachineCard({ machine, onDeleted, onNotify }) {
  const [statusLoading, setStatusLoading] = useState(false)
  const [isOnline, setIsOnline] = useState(false)
  const [toggling, setToggling] = useState(false)

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

  const glowColor = isOnline ? 'rgba(76, 175, 80, 0.7)' : 'rgba(244, 67, 54, 0.7)'
  const iconColor = isOnline ? 'success.main' : 'error.main'

  return (
    <Card variant="outlined" sx={{ position: 'relative', overflow: 'visible', padding: '0.5rem' }}>
      <Box sx={{ position: 'absolute', top: '1rem', right: '1rem', display: 'flex', alignItems: 'center', gap: 1 }}>
        <Tooltip slots={{ transition: Fade }} title={isOnline ? 'turn off' : 'turn on'}>
          <span>
            <Switch
              size="small"
              checked={isOnline}
              onChange={handleToggle}
              disabled={toggling || statusLoading}
              slotProps={{ input: { 'aria-label': 'toggle power' } }}
              sx={{
                p: 0.5,
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
          </span>
        </Tooltip>
        <PowerSettingsNewIcon sx={{ color: iconColor, filter: `drop-shadow(0 0 10px ${glowColor})` }} />
      </Box>
      <Typography variant="h5" align="center">{machine.name}</Typography>
      <CardContent>
        <Stack spacing={0.5} sx={{ mt: 1 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="body2" color="text.secondary" sx={{ width: '2rem' }}>mac</Typography>
            <Chip size="small" label={machine.mac} variant="outlined" />
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="body2" color="text.secondary" sx={{ width: '2rem' }}>ip</Typography>
            <Chip size="small" label={machine.ip} variant="outlined" />
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="body2" color="text.secondary" sx={{ width: '2rem' }}>ssh</Typography>
            <Chip size="small" label={machine.sshUser} variant="outlined" />
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  )
}

export default MachineCard


