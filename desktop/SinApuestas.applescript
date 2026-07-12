-- SinApuestas — app de macOS para bloquear las casas de apuestas.
-- Doble clic → ventana con contraseña y días → un solo cuadro nativo de
-- administrador. Sin Terminal.

property appDir : "/Library/Application Support/SinApuestas"

on resourcesDir()
	set p to POSIX path of (path to resource "blocker.sh")
	return do shell script "dirname " & quoted form of p
end resourcesDir

-- Lee el estado actual sin pedir contraseña. Devuelve {installed, days}.
on readState()
	set out to do shell script "cat " & quoted form of (appDir & "/state") & " 2>/dev/null || true"
	if out does not contain "PROTECTION_ON=1" then return {false, 0}
	set lockLine to do shell script "awk -F= '/LOCK_UNTIL/{print $2}' " & quoted form of (appDir & "/state") & " 2>/dev/null || echo 0"
	set daysLeft to (do shell script "echo $(( ( " & lockLine & " - $(date +%s) + 86399) / 86400 ))") as integer
	if daysLeft < 0 then set daysLeft to 0
	return {true, daysLeft}
end readState

-- Escribe la contraseña a un archivo temporal 600 sin exponerla en procesos.
on writePasswordTemp(pw)
	set pwPath to do shell script "mktemp /tmp/sa.XXXXXX"
	set fref to (open for access (POSIX file pwPath) with write permission)
	try
		set eof of fref to 0
		write pw to fref as «class utf8»
	end try
	close access fref
	do shell script "chmod 600 " & quoted form of pwPath
	return pwPath
end writePasswordTemp

on askPassword(prompt)
	set d to display dialog prompt default answer "" with hidden answer buttons {"Cancelar", "Continuar"} default button "Continuar" with title "SinApuestas"
	return text returned of d
end askPassword

on doInstall()
	set resDir to resourcesDir()

	display dialog "SinApuestas bloqueará cientos de casas de apuestas en esta computadora." & return & return & "La contraseña de custodio idealmente la escribe otra persona de confianza y no te la dice: así no puedes quitar el bloqueo en un impulso." buttons {"Cancelar", "Empezar"} default button "Empezar" with title "SinApuestas" with icon note

	set pw1 to askPassword("Escribe la contraseña de custodio:")
	if pw1 is "" then error "La contraseña no puede estar vacía."
	set pw2 to askPassword("Repite la contraseña de custodio:")
	if pw1 is not equal to pw2 then error "Las contraseñas no coinciden."

	set dChoice to display dialog "¿Cuántos días de compromiso? Durante ese tiempo, ni con la contraseña se puede desactivar." & return & return & "(Escribe 0 solo para probar.)" default answer "30" buttons {"Cancelar", "Activar bloqueo"} default button "Activar bloqueo" with title "SinApuestas"
	set daysText to text returned of dChoice
	try
		set daysNum to daysText as integer
	on error
		set daysNum to 30
	end try
	if daysNum < 0 then set daysNum to 0

	set pwPath to writePasswordTemp(pw1)
	try
		do shell script "/bin/bash " & quoted form of (resDir & "/install-app.sh") & " " & quoted form of resDir & " " & quoted form of pwPath & " " & (daysNum as text) with administrator privileges
	on error errMsg
		do shell script "rm -f " & quoted form of pwPath
		error "No se pudo instalar: " & errMsg
	end try

	if daysNum is 0 then
		set extra to "Es una prueba (0 días): puedes desactivarlo cuando quieras desde esta misma app."
	else
		set extra to "Quedará bloqueado " & (daysNum as text) & " días. ¡Ánimo, vas a lograrlo! 💚"
	end if
	display dialog "✓ Listo. Las casas de apuestas quedaron bloqueadas y el vigilante quedó activo (arranca solo con la computadora)." & return & return & extra buttons {"Cerrar"} default button "Cerrar" with title "SinApuestas" with icon note
end doInstall

on doDeactivate(daysLeft)
	if daysLeft > 0 then
		display dialog "Aún faltan " & (daysLeft as text) & " días de tu compromiso." & return & return & "Ni con la contraseña se puede desactivar antes. Vas muy bien. 💪" buttons {"Cerrar"} default button "Cerrar" with title "SinApuestas" with icon caution
		return
	end if
	set pw to askPassword("Escribe la contraseña de custodio para desactivar:")
	if pw is "" then return
	set pwPath to writePasswordTemp(pw)
	set res to do shell script "/bin/bash " & quoted form of (appDir & "/blocker.sh") & " stop " & quoted form of pwPath with administrator privileges
	if res contains "DESACTIVADO" then
		display dialog "Bloqueo desactivado." buttons {"Cerrar"} default button "Cerrar" with title "SinApuestas"
	else if res contains "CONTRASEÑA_INCORRECTA" then
		display dialog "Contraseña incorrecta." buttons {"Cerrar"} default button "Cerrar" with title "SinApuestas" with icon stop
	else if res contains "COMPROMISO_ACTIVO" then
		display dialog "Aún estás en tu período de compromiso." buttons {"Cerrar"} default button "Cerrar" with title "SinApuestas" with icon caution
	else
		display dialog "No se pudo desactivar." buttons {"Cerrar"} default button "Cerrar" with title "SinApuestas" with icon stop
	end if
end doDeactivate

on run
	try
		set theState to readState()
		if item 1 of theState then
			set daysLeft to item 2 of theState
			if daysLeft > 0 then
				set msg to "Estado: ACTIVO 🛡️" & return & "Faltan " & (daysLeft as text) & " días de tu compromiso (no se puede desactivar antes)."
				display dialog msg buttons {"Cerrar"} default button "Cerrar" with title "SinApuestas" with icon note
			else
				set msg to "Estado: ACTIVO 🛡️" & return & "Tu compromiso ya se cumplió. Puedes desactivarlo si quieres."
				set r to display dialog msg buttons {"Cerrar", "Desactivar"} default button "Cerrar" with title "SinApuestas" with icon note
				if button returned of r is "Desactivar" then doDeactivate(0)
			end if
		else
			doInstall()
		end if
	on error errMsg number errNum
		if errNum is -128 then return -- cancelado por el usuario
		display dialog errMsg buttons {"Cerrar"} default button "Cerrar" with title "SinApuestas" with icon stop
	end try
end run
